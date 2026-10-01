/** Config probe: disposable-cwd session → Config option index (per-model config options). */
import { Effect, Exit, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';

import type { NormalizedConfigOption } from './acpSessionBootstrap.ts';
import { normalizeConfigOptions, normalizeModels } from './acpSessionBootstrap.ts';

export type ConfigOptionIndex = {
  readonly byModel: Readonly<Record<string, readonly NormalizedConfigOption[]>>;
  readonly defaultModelId: string;
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
): ConfigOptionIndex => ({
  byModel: Object.fromEntries(
    Object.entries(byModelRaw).map(([modelId, raw]) => [modelId, normalizeConfigOptions(raw)]),
  ),
  defaultModelId,
});

export const configOptionIndexIsNonempty = (index: ConfigOptionIndex | undefined): boolean =>
  index !== undefined && Object.keys(index.byModel).length > 0;

type ProbeAgent<E = never> = {
  readonly 'session/close': (params: { sessionId: string }) => Effect.Effect<unknown, E>;
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

/**
 * Disposable-cwd Config probe. Publishes nothing itself — caller clears/publishes the index Atom.
 * `session/close` failure is not probe failure (warn + still return index).
 */
export const runConfigProbe = Effect.fn('runConfigProbe')(function* <E>(agent: ProbeAgent<E>) {
  const fs = yield* FileSystem;
  const probeCwd = yield* fs.makeTempDirectory({ prefix: 'ao-config-probe-' });
  const sessionNew = yield* agent['session/new']({ cwd: probeCwd, mcpServers: [] });
  const models = normalizeModels(sessionNew);
  if (models.currentId === undefined) {
    return yield* new ConfigProbeError({ message: 'Config probe: session/new has no model currentValue' });
  }

  const defaultModelId = models.currentId;
  const byModelRaw: Record<string, unknown> = { [defaultModelId]: sessionNew };

  for (const model of models.options.filter(entry => entry.id !== defaultModelId)) {
    const setResult = yield* agent['session/set_config_option']({
      configId: 'model',
      sessionId: sessionNew.sessionId,
      value: model.id,
    });
    byModelRaw[model.id] = setResult;
  }

  const index = configOptionIndexFromProbeResponses(defaultModelId, byModelRaw);

  const closeExit = yield* Effect.exit(agent['session/close']({ sessionId: sessionNew.sessionId }));
  if (Exit.isFailure(closeExit)) {
    yield* Effect.logWarning('Config probe session/close failed', closeExit.cause);
  }

  return index;
});
