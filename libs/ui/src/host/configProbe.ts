/** Config probe: disposable-cwd session → Config option index (per-model config options). */
import { Effect, Exit, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';

import type { NormalizedConfigOption } from './acpSessionBootstrap.ts';
import { CONFIG_PROBE_CWD_PREFIX, normalizeConfigOptions, normalizeModels } from './acpSessionBootstrap.ts';

export type ConfigOptionIndex = {
  readonly byModel: Readonly<Record<string, readonly NormalizedConfigOption[]>>;
  readonly defaultModelId: string;
  /** Model ids offered by session/new but not successfully probed (soft-failed switches). */
  readonly unavailableModelIds: readonly string[];
};

export type ConfigOptionValues = Readonly<Record<string, boolean | string>>;

export class ConfigProbeError extends Schema.TaggedError<ConfigProbeError>()('ConfigProbeError', {
  message: Schema.String,
}) {}

/** CurrentValues map from a model row (probe `currentValue`s). */
export const configValuesFromOptions = (options: readonly NormalizedConfigOption[]): ConfigOptionValues => {
  const values: Record<string, boolean | string> = {};
  for (const option of options) {
    if (option.currentValue !== undefined) {
      values[option.id] = option.currentValue;
    }
  }
  return values;
};

/**
 * Model change: keep local pick when still valid; else probe `currentValue`.
 * Drop keys absent from the new row.
 */
export const preserveConfigValuesOnModelChange = (
  previous: ConfigOptionValues,
  nextOptions: readonly NormalizedConfigOption[],
): ConfigOptionValues => {
  const next: Record<string, boolean | string> = {};
  for (const option of nextOptions) {
    const prior = Object.hasOwn(previous, option.id) ? previous[option.id] : undefined;
    if (option.type === 'select') {
      const stillValid = typeof prior === 'string' && option.choices.some(choice => choice.id === prior);
      if (stillValid) {
        next[option.id] = prior;
      } else if (option.currentValue !== undefined) {
        next[option.id] = option.currentValue;
      }
    } else if (typeof prior === 'boolean') {
      next[option.id] = prior;
    } else if (option.currentValue !== undefined) {
      next[option.id] = option.currentValue;
    }
  }
  return next;
};

/** Build index from raw probe responses stored as-is per model id (no cross-model merge). */
export const configOptionIndexFromProbeResponses = (
  defaultModelId: string,
  byModelRaw: Readonly<Record<string, unknown>>,
  unavailableModelIds: readonly string[] = [],
): ConfigOptionIndex => ({
  byModel: Object.fromEntries(
    Object.entries(byModelRaw).map(([modelId, raw]) => [modelId, normalizeConfigOptions(raw)]),
  ),
  defaultModelId,
  unavailableModelIds,
});

/** Model select choice label when the id was soft-failed during config probe. */
export const modelSelectChoiceLabel = (name: string, unavailable: boolean): string =>
  unavailable ? `${name} (unavailable)` : name;

export const isModelChoiceUnavailable = (
  optionId: string,
  choiceId: string,
  unavailableModelIds: readonly string[],
): boolean => optionId === 'model' && unavailableModelIds.includes(choiceId);

export const configOptionIndexIsNonempty = (index: ConfigOptionIndex | undefined): boolean =>
  index !== undefined && Object.keys(index.byModel).length > 0;

type ProbeAgent<E = never> = {
  readonly 'session/close': (params: { sessionId: string }) => Effect.Effect<unknown, E>;
  readonly 'session/delete': (params: { sessionId: string }) => Effect.Effect<unknown, E>;
  readonly 'session/new': (params: {
    cwd: string;
    mcpServers: readonly [];
  }) => Effect.Effect<{ readonly sessionId: string }, E>;
  readonly 'session/set_config_option': (params: {
    configId: string;
    sessionId: string;
    value: string;
  }) => Effect.Effect<unknown, E>;
};

const bestEffort = Effect.fn('configProbeBestEffort')(function* <E>(label: string, effect: Effect.Effect<unknown, E>) {
  const exit = yield* Effect.exit(effect);
  if (Exit.isFailure(exit)) {
    yield* Effect.logWarning(`Config probe ${label} failed`, exit.cause);
  }
});

/**
 * Disposable-cwd Config probe. Publishes nothing itself — caller clears/publishes the index Atom.
 * Close/delete/temp cleanup failures are not probe failure (warn + still return index).
 */
export const runConfigProbe = Effect.fn('runConfigProbe')(function* <E>(agent: ProbeAgent<E>) {
  const fs = yield* FileSystem;
  const probeCwd = yield* fs.makeTempDirectory({ prefix: CONFIG_PROBE_CWD_PREFIX });
  const sessionNew = yield* agent['session/new']({ cwd: probeCwd, mcpServers: [] });

  // Soft-close then delete so adapters that keep closed rows (gemini-acp) drop the probe from history.
  const cleanup = Effect.gen(function* () {
    yield* bestEffort('session/close', agent['session/close']({ sessionId: sessionNew.sessionId }));
    yield* bestEffort('session/delete', agent['session/delete']({ sessionId: sessionNew.sessionId }));
    yield* bestEffort('temp cwd remove', fs.remove(probeCwd, { force: true, recursive: true }));
  });

  return yield* Effect.gen(function* () {
    const models = normalizeModels(sessionNew);
    if (models.currentId === undefined) {
      return yield* new ConfigProbeError({ message: 'Config probe: session/new has no model currentValue' });
    }

    const defaultModelId = models.currentId;
    const byModelRaw: Record<string, unknown> = { [defaultModelId]: sessionNew };

    for (const model of models.options.filter(entry => entry.id !== defaultModelId)) {
      const setExit = yield* Effect.exit(
        agent['session/set_config_option']({
          configId: 'model',
          sessionId: sessionNew.sessionId,
          value: model.id,
        }),
      );
      if (Exit.isFailure(setExit)) {
        yield* Effect.logWarning('Config probe set_config_option failed for model', model.id, setExit.cause);
      } else {
        byModelRaw[model.id] = setExit.value;
      }
    }

    const unavailableModelIds = models.options
      .map(entry => entry.id)
      .filter(modelId => !Object.hasOwn(byModelRaw, modelId));

    return configOptionIndexFromProbeResponses(defaultModelId, byModelRaw, unavailableModelIds);
  }).pipe(Effect.ensuring(cleanup));
});
