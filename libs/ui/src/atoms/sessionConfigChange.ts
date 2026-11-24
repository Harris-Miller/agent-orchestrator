/**
 * Session configuration changes: every `session/set_config_option` the Harness sends (glossary: Session configuration,
 * Config change, Lazy hydrate; desktop ADR-0007, ADR-0016).
 *
 * Interface:
 * - {@link setSessionConfigOption}: the user's Config change on an active Session (gated, optimistic).
 * - {@link applySessionConfigValue}: one Harness-driven set (the Virtual Lazy hydrate pick).
 * - {@link applySessionConfigValues}: Config diffs for Materialize, Handoff and the activation reset.
 *
 * Invariants:
 * 1. One Session configuration. A Session's selected model and mode are its `model` / `mode` options; no other field
 *    holds them.
 * 2. Latest-snapshot folds. Every agent response is folded into the Session configuration of the latest snapshot. No
 *    write here uses a snapshot value read before an RPC wait, except the single `previous` option value of rule 4.
 * 3. Atomic begin (Config change). In one snapshot write: if the option already has the value, nothing happens and no
 *    RPC is sent; if the Composer action rule (Bootstrap usable, Session active, no Pending client request or Pending
 *    interaction) does not decide Send, it fails with {@link SessionConfigUnavailable} and the snapshot is unchanged;
 *    otherwise the Pending client request `config` and the optimistic value are set together.
 * 4. Own-write rollback (Config change). A failed set (typed error or defect) reverts that one option to its previous
 *    value only if it still holds the value the change wrote. An interrupted set reverts nothing. The Pending client
 *    request is always cleared, including on interrupt.
 * 5. No resurrection. A fold or end for a Session no longer in the map leaves it absent.
 * 6. Config diffs ({@link applySessionConfigValues}): recomputed from the latest Session after each set; each option is
 *    attempted at most once; the first failure stops the loop (`stoppedEarly: true`), and so does a missing Session;
 *    nothing is gated or optimistic, and it never fails.
 * 7. Lazy hydrate is unchanged. Every set goes through `sessionRpc.setConfigOption`, which reports `ModelPicked` /
 *    `ModelPickFailed` to the Harness event fold.
 *
 * Error modes: {@link SessionConfigUnavailable} (a refused Config change); `BackendNotConnected` and RPC errors from
 * `setConfigOption` ({@link setSessionConfigOption}, {@link applySessionConfigValue}). {@link applySessionConfigValues}
 * never fails.
 */
import { Cause, Effect, Exit, Schema } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';
import { sessionAttributes } from '@lib/hub/telemetryKeys';

import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { ConfigOptionValues } from '../host/configProbe.ts';
import { applyConfigResult, beginConfigChange, endConfigChange } from '../host/harnessStateTransitions.ts';
import { configValueDiffs } from '../host/sessionConfiguration.ts';
import type { ConfigValueDiff } from '../host/sessionConfiguration.ts';
import { setConfigOption } from '../host/sessionRpc.ts';

import { backendHarnessSnapshotAtom, modifyHarnessSnapshot, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { annotateSessionLogs } from '../host/sessionTelemetry.ts';

type Registry = AtomRegistry.AtomRegistry;

export type SessionConfigTarget = {
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

/** A Config change was refused because the Composer action rule does not decide Send for the Session right now. */
export class SessionConfigUnavailable extends Schema.TaggedError<SessionConfigUnavailable>()(
  'SessionConfigUnavailable',
  { message: Schema.String },
) {}

type SetConfigOptionError = Effect.Error<ReturnType<typeof setConfigOption>>;

/** One Harness-driven set; the response is folded into the latest snapshot. */
export const applySessionConfigValue = Effect.fnUntraced(function* (
  registry: Registry,
  { launchTarget, sessionId }: SessionConfigTarget,
  change: ConfigValueDiff,
): Effect.fn.Return<void, SetConfigOptionError> {
  const response = yield* setConfigOption(
    launchTarget,
    sessionId,
    change.configId,
    change.type === 'boolean' ? { type: 'boolean', value: change.value } : { type: 'select', value: change.value },
  );
  updateHarnessSnapshot(registry, launchTarget, current => applyConfigResult(current, sessionId, change, response));
});

/** The user's Config change on an active Session. */
export const setSessionConfigOption = Effect.fn('setSessionConfigOption')(function* (
  registry: Registry,
  target: SessionConfigTarget,
  change: ConfigValueDiff,
): Effect.fn.Return<void, SessionConfigUnavailable | SetConfigOptionError> {
  const { launchTarget, sessionId } = target;
  yield* Effect.annotateCurrentSpan(sessionAttributes(launchTarget, sessionId));
  // Begin and installing the end run uninterruptibly: no interrupt can land between them (invariant 4).
  return yield* Effect.uninterruptibleMask(restore =>
    Effect.gen(function* () {
      const begun = modifyHarnessSnapshot(registry, launchTarget, current => {
        const result = beginConfigChange(current, sessionId, change);
        return [result, result._tag === 'Begun' ? result.snapshot : current];
      });
      if (begun._tag === 'Unchanged') {
        return;
      }
      if (begun._tag === 'Refused') {
        const reason = begun.action._tag === 'Unavailable' ? begun.action.reason : begun.action._tag;
        return yield* new SessionConfigUnavailable({
          message: `Config changes are not available for this session right now (${reason})`,
        });
      }
      return yield* restore(applySessionConfigValue(registry, target, change)).pipe(
        Effect.onExit(exit =>
          Effect.sync(() => {
            const failed = Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause);
            updateHarnessSnapshot(registry, launchTarget, current =>
              endConfigChange(current, sessionId, failed ? { change, previous: begun.previous } : undefined),
            );
          }),
        ),
        Effect.tapCause(cause =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.logError('Config change failed; reverting', cause).pipe(
                Effect.annotateLogs({ config_id: change.configId }),
                annotateSessionLogs(launchTarget, sessionId),
              ),
        ),
      );
    }),
  );
});

/** Bring a Session's configuration to `values`, one set at a time (Config diffs). Never fails. */
export const applySessionConfigValues = Effect.fn('applySessionConfigValues')(function* (
  registry: Registry,
  target: SessionConfigTarget,
  values: ConfigOptionValues,
): Effect.fn.Return<{ readonly stoppedEarly: boolean }> {
  const attempted = new Set<string>();
  for (;;) {
    const { sessions } = registry.get(backendHarnessSnapshotAtom(target.launchTarget));
    if (!(target.sessionId in sessions)) {
      return { stoppedEarly: true };
    }
    const diff = configValueDiffs(sessions[target.sessionId].configuration ?? [], values).find(
      candidate => !attempted.has(candidate.configId),
    );
    if (diff === undefined) {
      return { stoppedEarly: false };
    }
    attempted.add(diff.configId);
    const exit = yield* Effect.exit(applySessionConfigValue(registry, target, diff));
    if (Exit.isFailure(exit)) {
      yield* Effect.logWarning('Config diff failed; stopping').pipe(
        Effect.annotateLogs({ config_id: diff.configId }),
        annotateSessionLogs(target.launchTarget, target.sessionId),
      );
      return { stoppedEarly: true };
    }
  }
});
