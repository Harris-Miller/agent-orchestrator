/** Config probe: disposable-cwd session → Config option index (per-model config options). */
import type { ConfigOptionIndexDocument } from '@lib/hoa-home';
import { Effect, Exit, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';

import type { NormalizedConfigOption } from './acpSessionBootstrap.ts';
import { CONFIG_PROBE_CWD_PREFIX } from './acpSessionBootstrap.ts';
import { mergeConfigOptionIndex } from './configOptionIndexHydrate.ts';

/** Shape is owned by the on-disk cache document; `unavailableModelIds` = advertised on session/new but refused when picked. */
export type ConfigOptionIndex = ConfigOptionIndexDocument;

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

export const configOptionIndexIsNonempty = (index: ConfigOptionIndex | undefined): boolean =>
  index !== undefined && Object.keys(index.byModel).length > 0;

type ProbeAgent<E = never> = {
  readonly 'session/close': (params: { sessionId: string }) => Effect.Effect<unknown, E>;
  readonly 'session/delete': (params: { sessionId: string }) => Effect.Effect<unknown, E>;
  readonly 'session/new': (params: {
    cwd: string;
    mcpServers: readonly [];
  }) => Effect.Effect<{ readonly sessionId: string }, E>;
};

const bestEffort = Effect.fn('configProbeBestEffort')(function* <E>(label: string, effect: Effect.Effect<unknown, E>) {
  const exit = yield* Effect.exit(effect);
  if (Exit.isFailure(exit)) {
    yield* Effect.logWarning(`Config probe ${label} failed`, exit.cause);
  }
});

/**
 * Cold-cache Config probe: one disposable-cwd `session/new` seeds the model list and default row; other rows
 * arrive by Lazy hydrate. Publishes nothing itself. Close/delete/temp cleanup failures warn but do not fail the probe.
 */
export const runConfigProbe = Effect.fn('runConfigProbe')(function* <E>(agent: ProbeAgent<E>) {
  const fs = yield* FileSystem;
  const probeCwd = yield* fs.makeTempDirectory({ prefix: CONFIG_PROBE_CWD_PREFIX });
  const sessionNew = yield* agent['session/new']({ cwd: probeCwd, mcpServers: [] });

  // Soft-close then delete so adapters that keep closed rows (antigravity-acp) drop the probe from history.
  const cleanup = Effect.gen(function* () {
    yield* bestEffort('session/close', agent['session/close']({ sessionId: sessionNew.sessionId }));
    yield* bestEffort('session/delete', agent['session/delete']({ sessionId: sessionNew.sessionId }));
    yield* bestEffort('temp cwd remove', fs.remove(probeCwd, { force: true, recursive: true }));
  });

  return yield* Effect.gen(function* () {
    const index = mergeConfigOptionIndex(undefined, { _tag: 'SessionNew', response: sessionNew });
    if (index === undefined) {
      return yield* new ConfigProbeError({ message: 'Config probe: session/new has no model currentValue' });
    }
    return index;
  }).pipe(Effect.ensuring(cleanup));
});
