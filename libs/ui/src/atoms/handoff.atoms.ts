/** Cross-launch-target session handoff Atom fns. */
import { Cause, Deferred, Duration, Effect, Exit, Fiber, Option, Schema } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';
import {
  HANDOFF_PROMPT_CHARS,
  HANDOFF_SOURCE_SESSION_ID,
  HANDOFF_TARGET_LAUNCH_TARGET,
  sessionAttributes,
} from '@lib/hub/telemetryKeys';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { isUsablePhase } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { ConfigOptionValues } from '../host/configProbe.ts';
import { buildTargetHandoffSeedPrompt, SOURCE_HANDOFF_PROMPT } from '../host/handoffDocument.ts';
import { expectHandoff } from '../host/handoffSubmission.ts';
import { addCreatedSession } from '../host/harnessStateTransitions.ts';
import { currentHubUnavailableReason } from '../host/hubSessions.ts';
import { RequestErrorDetail, requestErrorDetail } from '../host/requestError.ts';
import { createSession } from '../host/sessionRpc.ts';

import {
  backendHarnessSnapshotAtom,
  requireLaunchTargetUsable,
  unifiedSessionHistoryAtom,
} from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { cancelPromptTurn, sendPromptTurn } from './promptTurn.ts';
import { applySessionConfigValues } from './sessionConfigChange.ts';
import { ensureWorkspaceProject } from './trackSession.ts';
import { select } from './virtualSession.atoms.ts';
import { annotateLaunchTargetLogs, annotateSessionLogs } from '../host/sessionTelemetry.ts';

export const handoffInProgressAtom = Atom.make(false).pipe(Atom.keepAlive);

export class HandoffError extends Schema.TaggedError<HandoffError>()('HandoffError', {
  detail: RequestErrorDetail,
  message: Schema.String,
}) {}

/**
 * Run one Handoff step's Prompt turn on `sessionId` (a full Send, never Steering). A refused or cancelled turn fails
 * the Handoff.
 */
export const handoffPrompt = Effect.fn('handoffPrompt')(
  function* (registry: AtomRegistry.AtomRegistry, launchTarget: AgentLaunchTarget, sessionId: string, text: string) {
    yield* Effect.logInfo('Handoff prompt').pipe(Effect.annotateLogs({ [HANDOFF_PROMPT_CHARS]: text.trim().length }));
    const result = yield* sendPromptTurn(registry, { launchTarget, sessionId, text }).pipe(
      Effect.catchTag('ComposerActionUnavailable', error => Effect.fail(new HandoffError({ message: error.message }))),
    );
    if (result._tag === 'Rejected') {
      return yield* new HandoffError({
        detail: requestErrorDetail(result.error),
        message: `The agent rejected the prompt (code ${result.error.code})`,
      });
    }
    if (result.stopReason === 'cancelled') {
      return yield* new HandoffError({ message: `Session ${sessionId} prompt was cancelled` });
    }
  },
  (effect, _registry, launchTarget, sessionId) =>
    effect.pipe(
      // A cancel is not a failure (same policy as `logFailure` in `sessionRpc.ts`).
      Effect.tapCause(cause =>
        Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError('handoffPrompt failed', cause),
      ),
      annotateSessionLogs(launchTarget, sessionId),
    ),
);

/** How long a Handoff waits for the source agent to end the turn that asks it for the document. */
export const SOURCE_TURN_TIMEOUT = Duration.minutes(5);

/**
 * The source Handoff prompt, giving up after {@link SOURCE_TURN_TIMEOUT}: a stalled agent would otherwise leave the
 * Handoff in progress for good. The agent's turn is cancelled first, or it would keep running after the Handoff failed.
 */
export const handoffSourcePrompt = Effect.fnUntraced(function* (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
) {
  const turn = yield* Effect.forkChild(handoffPrompt(registry, launchTarget, sessionId, SOURCE_HANDOFF_PROMPT));
  const finished = yield* Fiber.join(turn).pipe(Effect.timeoutOption(SOURCE_TURN_TIMEOUT));
  if (Option.isNone(finished)) {
    yield* cancelPromptTurn(registry, { launchTarget, sessionId }).pipe(Effect.ignore);
    yield* Fiber.interrupt(turn);
    return yield* new HandoffError({
      message: 'The source agent did not finish its turn in time, so the Handoff was cancelled',
    });
  }
});

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
          yield* Effect.annotateCurrentSpan(sessionAttributes(arg.sourceLaunchTarget, arg.sourceSessionId));
          yield* Effect.logInfo('Handoff started').pipe(
            Effect.annotateLogs({ [HANDOFF_TARGET_LAUNCH_TARGET]: arg.targetLaunchTarget }),
            annotateSessionLogs(arg.sourceLaunchTarget, arg.sourceSessionId),
          );
          const sourceEntry = get(unifiedSessionHistoryAtom).find(
            entry => entry.launchTarget === arg.sourceLaunchTarget && entry.sessionId === arg.sourceSessionId,
          );
          if (sourceEntry === undefined) {
            return yield* new HandoffError({ message: 'Source session cwd not found on history' });
          }

          const unavailable = currentHubUnavailableReason(arg.sourceLaunchTarget, arg.sourceSessionId);
          if (unavailable !== undefined) {
            return yield* new HandoffError({ message: `Handoff is unavailable: ${unavailable}` });
          }

          // Source handoff prompt is the only hard gate: failure means no target session. Only a `submit_handoff` call
          // made during this turn counts; a turn that ends without one fails (no text fallback).
          const handoffDocument = yield* Effect.scoped(
            Effect.gen(function* () {
              const submitted = yield* expectHandoff(arg.sourceLaunchTarget, arg.sourceSessionId);
              yield* handoffSourcePrompt(get.registry, arg.sourceLaunchTarget, arg.sourceSessionId);
              if (!(yield* Deferred.isDone(submitted))) {
                return yield* new HandoffError({ message: 'The source agent never called submit_handoff' });
              }
              return yield* Deferred.await(submitted);
            }),
          );

          // After a successful source response, target create / config / seed failures are soft.
          if (!isUsablePhase(get(backendHarnessSnapshotAtom(arg.targetLaunchTarget)).phase)) {
            yield* Effect.logWarning('Handoff soft-abort; target launch target not usable').pipe(
              annotateLaunchTargetLogs(arg.targetLaunchTarget),
            );
            return;
          }

          const createExit = yield* Effect.exit(createSession(arg.targetLaunchTarget, sourceEntry.cwd));
          if (Exit.isFailure(createExit)) {
            yield* Effect.logWarning('Handoff soft-abort; target session create failed').pipe(
              annotateLaunchTargetLogs(arg.targetLaunchTarget),
            );
            return;
          }
          const { cwd, result } = createExit.value;
          const { sessionId: targetSessionId } = result;

          // The target Session is in the map before its Config diffs, so each response folds into it.
          updateHarnessSnapshot(get.registry, arg.targetLaunchTarget, current =>
            addCreatedSession(current, { cwd, result }),
          );
          yield* ensureWorkspaceProject(get.registry, cwd);
          yield* select(get.registry, { _tag: 'Session', sessionId: targetSessionId });

          const configured = yield* applySessionConfigValues(
            get.registry,
            { launchTarget: arg.targetLaunchTarget, sessionId: targetSessionId },
            arg.configValues,
          );
          if (configured.stoppedEarly) {
            yield* Effect.logWarning('Handoff Config diffs stopped early').pipe(
              annotateSessionLogs(arg.targetLaunchTarget, targetSessionId),
            );
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
            yield* Effect.logWarning('Handoff target seed prompt failed').pipe(
              annotateSessionLogs(arg.targetLaunchTarget, targetSessionId),
            );
          } else {
            yield* Effect.logInfo('Handoff complete').pipe(
              Effect.annotateLogs({ [HANDOFF_SOURCE_SESSION_ID]: arg.sourceSessionId }),
              annotateSessionLogs(arg.targetLaunchTarget, targetSessionId),
            );
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
