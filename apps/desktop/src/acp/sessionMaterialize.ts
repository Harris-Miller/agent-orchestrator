/** Staged Materialize helpers: roster entry, config diffs, activated session snapshot. */
import { Effect, Exit } from 'effect';

import {
  applySetConfigOptionResult,
  normalizeSelectableConfigOptions,
  normalizeSessionInfoFromNew,
  patchConfigOptionValue,
  selectionFromSessionConfiguration,
} from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo, SessionSnapshot } from './acpSessionBootstrap.ts';
import { emptySessionTranscript } from './sessionUpdateReducer.ts';

/** Fields carried forward across activation merges (create may pass only `{ cwd }`). */
export type SessionActivationCarry = Partial<
  Pick<SessionSnapshot, 'availableCommands' | 'cwd' | 'transcript' | 'usage'>
>;

export type ApplyConfigDiffsResult = {
  readonly sessionConfiguration: unknown;
  readonly stoppedEarly: boolean;
};

export type SetConfigOptionFn = (configId: string, value: string) => Effect.Effect<unknown, unknown>;

export type ConfigValueDiff = {
  readonly configId: string;
  readonly value: string;
};

/** Config options where desired values differ from the session's current values and remain valid choices. */
export const configValueDiffs = (
  sessionConfiguration: unknown,
  values: Readonly<Record<string, string>>,
): readonly ConfigValueDiff[] =>
  normalizeSelectableConfigOptions(sessionConfiguration).flatMap(option => {
    if (!Object.hasOwn(values, option.id)) {
      return [];
    }
    const desired = values[option.id];
    if (desired === option.currentValue || !option.choices.some(choice => choice.id === desired)) {
      return [];
    }
    return [{ configId: option.id, value: desired }];
  });

/** Roster entry from a successful `session/new` result (handoff early upsert). */
export const rosterEntryFromNew = (result: unknown, cwd: string): NormalizedSessionInfo | undefined =>
  normalizeSessionInfoFromNew(result, cwd);

/**
 * Apply config values that differ from the session via injectable `setOption`.
 * Stops on the first failure (partial configuration kept).
 */
export const applyConfigDiffs = Effect.fn('applyConfigDiffs')(function* (
  sessionConfiguration: unknown,
  values: Readonly<Record<string, string>>,
  setOption: SetConfigOptionFn,
) {
  let next: unknown = sessionConfiguration;
  let stoppedEarly = false;

  for (const diff of configValueDiffs(next, values)) {
    const patched = patchConfigOptionValue(next, diff.configId, diff.value);
    const exit = yield* Effect.exit(setOption(diff.configId, diff.value));
    if (Exit.isFailure(exit)) {
      yield* Effect.logWarning('Config option apply failed during materialize', diff.configId);
      stoppedEarly = true;
      break;
    }
    const { sessionConfiguration: folded } = applySetConfigOptionResult(patched, exit.value);
    next = folded;
  }

  return { sessionConfiguration: next, stoppedEarly } satisfies ApplyConfigDiffsResult;
});

/** Build an active session snapshot from an activation RPC result (+ optional carry fields). */
export const buildActivatedSession = (
  sessionId: string,
  result: unknown,
  existing?: SessionActivationCarry,
): SessionSnapshot => {
  const selection = selectionFromSessionConfiguration(result);
  return {
    availableCommands: existing?.availableCommands,
    cwd: existing?.cwd,
    selectedModeId: selection.selectedModeId,
    selectedModelId: selection.selectedModelId,
    sessionConfiguration: result,
    sessionId,
    status: 'active',
    transcript: existing?.transcript ?? emptySessionTranscript(),
    usage: existing?.usage,
  };
};
