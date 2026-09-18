/** Cross-launch-target session handoff Atom fns. */
import { Effect, Exit, Schema } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { upsertRosterEntry } from '../acp/acpSessionBootstrap.ts';
import { agentLaunchTargetLabel } from '../acp/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';
import { withUserChatMessage } from '../acp/applySessionUpdate.ts';
import { buildTargetHandoffSeedPrompt, extractHandoffDocument, SOURCE_HANDOFF_PROMPT } from '../acp/handoffDocument.ts';
import { applyConfigDiffs, buildActivatedSession, rosterEntryFromNew } from '../acp/sessionMaterialize.ts';
import { createSession, setConfigOption } from '../acp/sessionRpc.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import {
  backendHarnessStateAtom,
  providerConfigAtom,
  selectSession,
  unifiedSessionRosterAtom,
} from './backendStateAtoms.ts';
import {
  patchSession,
  sendPromptSoftCancel,
  syncProviderConfigFromSessionConfiguration,
  upsertSession,
  withSessionClientRequest,
} from './sessionPatch.ts';

/** True while a multi-step Handoff pipeline is running (covers gaps between RPCs). */
export const handoffInProgressAtom = Atom.make(false).pipe(Atom.keepAlive);

export class HandoffError extends Schema.TaggedError<HandoffError>()('HandoffError', {
  message: Schema.String,
}) {}

const promptPinnedSession = Effect.fn('promptPinnedSession')(
  function* (launchTarget: AgentLaunchTarget, get: AcpAtomGet, sessionId: string, text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return yield* new HandoffError({ message: 'Handoff prompt text is empty' });
    }

    const snapshot = get(backendHarnessStateAtom(launchTarget));
    if (snapshot.phase !== 'ready') {
      return yield* new HandoffError({ message: `Backend not ready for ${agentLaunchTargetLabel(launchTarget)}` });
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
    get.set(backendHarnessStateAtom(launchTarget), {
      ...snapshot,
      sessions: patchSession(snapshot.sessions, sessionId, current => withUserChatMessage(current, trimmed)),
    });

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

export const handoffSessionAtomFn = acpRuntime
  .fn(
    Effect.fn('handoffSessionAtomFn', { root: true })(
      function* (
        arg: {
          configValues: Readonly<Record<string, string>>;
          sourceLaunchTarget: AgentLaunchTarget;
          sourceSessionId: string;
          targetLaunchTarget: AgentLaunchTarget;
        },
        get: AcpAtomGet,
      ) {
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
        const sourceEntry = get(unifiedSessionRosterAtom).find(
          entry => entry.launchTarget === arg.sourceLaunchTarget && entry.sessionId === arg.sourceSessionId,
        );
        if (sourceEntry === undefined) {
          return yield* new HandoffError({ message: 'Source session cwd not found on roster' });
        }

        // Source handoff prompt is the only hard gate: failure means no target session.
        yield* promptPinnedSession(arg.sourceLaunchTarget, get, arg.sourceSessionId, SOURCE_HANDOFF_PROMPT);

        const sourceChatItems = get(backendHarnessStateAtom(arg.sourceLaunchTarget)).sessions[arg.sourceSessionId]
          .transcript.items;
        const handoffDocument = extractHandoffDocument(sourceChatItems);
        if (handoffDocument === undefined) {
          return yield* new HandoffError({ message: 'Handoff document missing from source agent response' });
        }

        // After a successful source response, target create / config / seed failures are soft.
        if (get(backendHarnessStateAtom(arg.targetLaunchTarget)).phase !== 'ready') {
          yield* Effect.logWarning('Handoff soft-abort; target launch target not ready', arg.targetLaunchTarget);
          return;
        }

        const createExit = yield* Effect.exit(createSession(arg.targetLaunchTarget, sourceEntry.cwd));
        if (Exit.isFailure(createExit)) {
          yield* Effect.logWarning('Handoff soft-abort; target session create failed', arg.targetLaunchTarget);
          return;
        }
        const { cwd, result } = createExit.value;
        const { sessionId: targetSessionId } = result;

        syncProviderConfigFromSessionConfiguration(get, arg.targetLaunchTarget, result);

        const rosterEntry = rosterEntryFromNew(result, cwd);
        const createdSnapshot = get(backendHarnessStateAtom(arg.targetLaunchTarget));
        get.set(backendHarnessStateAtom(arg.targetLaunchTarget), {
          ...createdSnapshot,
          sessionRoster:
            rosterEntry === undefined
              ? createdSnapshot.sessionRoster
              : upsertRosterEntry(createdSnapshot.sessionRoster, rosterEntry),
        });
        selectSession(get, arg.targetLaunchTarget, targetSessionId);

        const { defaults } = get(providerConfigAtom(arg.targetLaunchTarget)) ?? { defaults: {} };
        const setOption = (configId: string, value: string) =>
          setConfigOption(arg.targetLaunchTarget, targetSessionId, configId, value);

        const afterDefaults = yield* applyConfigDiffs(result, defaults, setOption);
        const afterOverrides = yield* applyConfigDiffs(afterDefaults.sessionConfiguration, arg.configValues, setOption);

        syncProviderConfigFromSessionConfiguration(get, arg.targetLaunchTarget, afterOverrides.sessionConfiguration);

        const configuredSnapshot = get(backendHarnessStateAtom(arg.targetLaunchTarget));
        get.set(backendHarnessStateAtom(arg.targetLaunchTarget), {
          ...configuredSnapshot,
          sessions: upsertSession(
            configuredSnapshot.sessions,
            buildActivatedSession(targetSessionId, afterOverrides.sessionConfiguration, { cwd }),
          ),
        });

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
      (effect, _arg, get: AcpAtomGet) =>
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
