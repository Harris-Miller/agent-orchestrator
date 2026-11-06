/** Cross-launch-target session handoff Atom fns. */
import { Effect, Exit, Schema } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { isUsablePhase } from '../host/acpSessionBootstrap.ts';
import { agentLaunchTargetLabel } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { withUserChatMessage } from '../host/applySessionUpdate.ts';
import type { ConfigOptionValues } from '../host/configProbe.ts';
import {
  buildTargetHandoffSeedPrompt,
  extractHandoffDocument,
  SOURCE_HANDOFF_PROMPT,
} from '../host/handoffDocument.ts';
import { upsertIntoSnapshot } from '../host/harnessStateTransitions.ts';
import { applyConfigDiffs, buildActivatedSession, historyEntryFromNew } from '../host/sessionMaterialize.ts';
import type { ConfigValueDiff } from '../host/sessionMaterialize.ts';
import { createSession, setConfigOption } from '../host/sessionRpc.ts';

import {
  backendHarnessSnapshotAtom,
  requireLaunchTargetUsable,
  unifiedSessionHistoryAtom,
} from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { patchSession, sendPromptSoftCancel, withSessionClientRequest } from './sessionPatch.atoms.ts';
import { select } from './virtualSession.atoms.ts';

export const handoffInProgressAtom = Atom.make(false).pipe(Atom.keepAlive);

export class HandoffError extends Schema.TaggedError<HandoffError>()('HandoffError', {
  message: Schema.String,
}) {}

const promptPinnedSession = Effect.fn('promptPinnedSession')(
  function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext, sessionId: string, text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return yield* new HandoffError({ message: 'Handoff prompt text is empty' });
    }

    const snapshot = get(backendHarnessSnapshotAtom(launchTarget));
    if (!isUsablePhase(snapshot.phase)) {
      return yield* new HandoffError({ message: `Backend not usable for ${agentLaunchTargetLabel(launchTarget)}` });
    }

    const session = snapshot.sessions[sessionId];
    if (session.status !== 'active') {
      return yield* new HandoffError({ message: `Session ${sessionId} is not active` });
    }
    if (
      session.pendingClientRequest !== undefined ||
      session.pendingElicitation !== undefined ||
      session.pendingPermission !== undefined
    ) {
      return yield* new HandoffError({ message: `Session ${sessionId} cannot accept a prompt right now` });
    }

    yield* Effect.logInfo('Pinned session prompt', launchTarget, sessionId, { chars: trimmed.length });
    updateHarnessSnapshot(get.registry, launchTarget, current => ({
      ...current,
      sessions: patchSession(current.sessions, sessionId, s => withUserChatMessage(s, trimmed)),
    }));

    const response = yield* withSessionClientRequest(
      launchTarget,
      get,
      sessionId,
      'prompt',
      sendPromptSoftCancel(launchTarget, get, sessionId, trimmed),
    );
    if (response === undefined) {
      return yield* new HandoffError({ message: `Session ${sessionId} skipped prompt` });
    }
    if (response.stopReason === 'cancelled') {
      return yield* new HandoffError({ message: `Session ${sessionId} prompt was cancelled` });
    }
  },
  (effect, launchTarget, _get, sessionId) =>
    effect.pipe(
      Effect.tapError(error => Effect.logError('promptPinnedSession failed', launchTarget, sessionId, error)),
    ),
);

export const createHandoffAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  const handoffSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('handoffSessionAtomFn', { root: true })(
        function* (
          arg: {
            configValues: ConfigOptionValues;
            sourceLaunchTarget: AgentLaunchTarget;
            sourceSessionId: string;
            targetLaunchTarget: AgentLaunchTarget;
          },
          get: Atom.FnContext,
        ) {
          // Shared action boundary: a stale picker selection must not hand off to a disabled / switching provider.
          const blocked = requireLaunchTargetUsable(get, arg.targetLaunchTarget);
          if (blocked !== undefined) {
            return yield* blocked;
          }
          get.set(handoffInProgressAtom, true);
          yield* Effect.annotateCurrentSpan({
            'acp.agent': arg.sourceLaunchTarget,
            'acp.sessionId': arg.sourceSessionId,
          });
          yield* Effect.logInfo('Handoff started', {
            sourceLaunchTarget: arg.sourceLaunchTarget,
            sourceSessionId: arg.sourceSessionId,
            targetLaunchTarget: arg.targetLaunchTarget,
          });
          const sourceEntry = get(unifiedSessionHistoryAtom).find(
            entry => entry.launchTarget === arg.sourceLaunchTarget && entry.sessionId === arg.sourceSessionId,
          );
          if (sourceEntry === undefined) {
            return yield* new HandoffError({ message: 'Source session cwd not found on history' });
          }

          // Source handoff prompt is the only hard gate: failure means no target session.
          yield* promptPinnedSession(arg.sourceLaunchTarget, get, arg.sourceSessionId, SOURCE_HANDOFF_PROMPT);

          const sourceChatItems = get(backendHarnessSnapshotAtom(arg.sourceLaunchTarget)).sessions[arg.sourceSessionId]
            .transcript.items;
          const handoffDocument = extractHandoffDocument(sourceChatItems);
          if (handoffDocument === undefined) {
            return yield* new HandoffError({ message: 'Handoff document missing from source agent response' });
          }

          // After a successful source response, target create / config / seed failures are soft.
          if (!isUsablePhase(get(backendHarnessSnapshotAtom(arg.targetLaunchTarget)).phase)) {
            yield* Effect.logWarning('Handoff soft-abort; target launch target not usable', arg.targetLaunchTarget);
            return;
          }

          const createExit = yield* Effect.exit(createSession(arg.targetLaunchTarget, sourceEntry.cwd));
          if (Exit.isFailure(createExit)) {
            yield* Effect.logWarning('Handoff soft-abort; target session create failed', arg.targetLaunchTarget);
            return;
          }
          const { cwd, result } = createExit.value;
          const { sessionId: targetSessionId } = result;

          const historyEntry = historyEntryFromNew(result, cwd);
          if (historyEntry !== undefined) {
            updateHarnessSnapshot(get.registry, arg.targetLaunchTarget, current =>
              upsertIntoSnapshot(current, { historyEntry }),
            );
          }
          yield* select(get.registry, { _tag: 'Session', sessionId: targetSessionId });

          const setOption = (diff: ConfigValueDiff) =>
            setConfigOption(
              arg.targetLaunchTarget,
              targetSessionId,
              diff.configId,
              diff.type === 'boolean' ? { type: 'boolean', value: diff.value } : { type: 'select', value: diff.value },
            );
          const afterOverrides = yield* applyConfigDiffs(result, arg.configValues, setOption);

          updateHarnessSnapshot(get.registry, arg.targetLaunchTarget, current =>
            upsertIntoSnapshot(current, {
              session: buildActivatedSession(targetSessionId, afterOverrides.sessionConfiguration, { cwd }),
            }),
          );

          const seedExit = yield* Effect.exit(
            promptPinnedSession(
              arg.targetLaunchTarget,
              get,
              targetSessionId,
              buildTargetHandoffSeedPrompt(handoffDocument),
            ),
          );
          if (Exit.isFailure(seedExit)) {
            yield* Effect.logWarning('Handoff target seed prompt failed', arg.targetLaunchTarget, targetSessionId);
          } else {
            yield* Effect.logInfo('Handoff complete', {
              sourceSessionId: arg.sourceSessionId,
              targetSessionId,
            });
          }
        },
        (effect, _arg, get: Atom.FnContext) =>
          effect.pipe(
            Effect.tapError(error => Effect.logError('Handoff failed', error)),
            Effect.ensuring(
              Effect.sync(() => {
                get.set(handoffInProgressAtom, false);
              }),
            ),
          ),
      ),
    )
    .pipe(Atom.keepAlive);

  return { handoffSessionAtomFn };
};
