/** Cross-launch-target session handoff Atom fns. */
import { Effect, Exit, Schema } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { isUsablePhase } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { ConfigOptionValues } from '../host/configProbe.ts';
import {
  buildTargetHandoffSeedPrompt,
  extractHandoffDocument,
  SOURCE_HANDOFF_PROMPT,
} from '../host/handoffDocument.ts';
import { addCreatedSession } from '../host/harnessStateTransitions.ts';
import { createSession } from '../host/sessionRpc.ts';

import {
  backendHarnessSnapshotAtom,
  requireLaunchTargetUsable,
  unifiedSessionHistoryAtom,
} from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { sendPromptTurn } from './promptTurn.ts';
import { applySessionConfigValues } from './sessionConfigChange.ts';
import { select } from './virtualSession.atoms.ts';

export const handoffInProgressAtom = Atom.make(false).pipe(Atom.keepAlive);

export class HandoffError extends Schema.TaggedError<HandoffError>()('HandoffError', {
  message: Schema.String,
}) {}

/**
 * Run one Handoff step's Prompt turn on `sessionId` (a full Send, never Steering). A refused or cancelled turn fails
 * the Handoff.
 */
export const handoffPrompt = Effect.fn('handoffPrompt')(
  function* (registry: AtomRegistry.AtomRegistry, launchTarget: AgentLaunchTarget, sessionId: string, text: string) {
    yield* Effect.logInfo('Handoff prompt', launchTarget, sessionId, { chars: text.trim().length });
    const { stopReason } = yield* sendPromptTurn(registry, { launchTarget, sessionId, text }).pipe(
      Effect.catchTag('ComposerActionUnavailable', error => Effect.fail(new HandoffError({ message: error.message }))),
    );
    if (stopReason === 'cancelled') {
      return yield* new HandoffError({ message: `Session ${sessionId} prompt was cancelled` });
    }
  },
  (effect, _registry, launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('handoffPrompt failed', launchTarget, sessionId, error))),
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
          yield* handoffPrompt(get.registry, arg.sourceLaunchTarget, arg.sourceSessionId, SOURCE_HANDOFF_PROMPT);

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

          // The target Session is in the map before its Config diffs, so each response folds into it.
          updateHarnessSnapshot(get.registry, arg.targetLaunchTarget, current =>
            addCreatedSession(current, { cwd, result }),
          );
          yield* select(get.registry, { _tag: 'Session', sessionId: targetSessionId });

          const configured = yield* applySessionConfigValues(
            get.registry,
            { launchTarget: arg.targetLaunchTarget, sessionId: targetSessionId },
            arg.configValues,
          );
          if (configured.stoppedEarly) {
            yield* Effect.logWarning('Handoff Config diffs stopped early', arg.targetLaunchTarget, targetSessionId);
          }

          const seedExit = yield* Effect.exit(
            handoffPrompt(
              get.registry,
              arg.targetLaunchTarget,
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
