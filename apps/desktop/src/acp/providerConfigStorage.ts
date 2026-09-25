/** Provider config catalog merge + harness defaults helpers (persistence via ao-home / Settings). */

import { readProviderConfigCatalog, writeProviderConfigCatalog, writeUserSettings } from '@lib/ao-home';
import type { UserSettings } from '@lib/ao-home';
import type { HostServices } from '@lib/context-services';
import { Effect, Option } from 'effect';
import type { Layer } from 'effect';

import type { NormalizedConfigChoice, NormalizedConfigOption } from './acpSessionBootstrap.ts';
import { normalizeSelectableConfigOptions } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

export type ProviderConfigCatalogEntry = {
  readonly category?: string;
  readonly choices: readonly NormalizedConfigChoice[];
  readonly description?: string;
  readonly id: string;
  readonly name: string;
};

export type ProviderConfigStored = {
  readonly catalog: readonly ProviderConfigCatalogEntry[];
  readonly defaults: Readonly<Record<string, string>>;
};

export const defaultsFromSelectable = (
  selectable: readonly NormalizedConfigOption[],
): Readonly<Record<string, string>> => {
  const defaults: Record<string, string> = {};
  for (const option of selectable) {
    if (option.currentValue !== undefined) {
      defaults[option.id] = option.currentValue;
    }
  }
  return defaults;
};

const catalogEntriesFromSelectable = (
  selectable: readonly NormalizedConfigOption[],
): readonly ProviderConfigCatalogEntry[] =>
  selectable.map(option => ({
    ...(option.category !== undefined ? { category: option.category } : {}),
    choices: option.choices.map(choice => ({
      id: choice.id,
      name: choice.name,
      ...(choice.description !== undefined ? { description: choice.description } : {}),
    })),
    ...(option.description !== undefined ? { description: option.description } : {}),
    id: option.id,
    name: option.name,
  }));

export const defaultsEqual = (
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(key => left[key] === right[key]);
};

/** Pure merge: replace catalog; seed or preserve defaults per refresh rules. */
export const mergeProviderConfigRefresh = (
  previous: ProviderConfigStored | undefined,
  selectable: readonly NormalizedConfigOption[],
): ProviderConfigStored => {
  const catalog = catalogEntriesFromSelectable(selectable);

  if (previous === undefined) {
    return { catalog, defaults: defaultsFromSelectable(selectable) };
  }

  const defaults: Record<string, string> = {};
  for (const option of selectable) {
    const prior = Object.hasOwn(previous.defaults, option.id) ? previous.defaults[option.id] : undefined;
    const stillValid = prior !== undefined && option.choices.some(choice => choice.id === prior);
    if (stillValid) {
      defaults[option.id] = prior;
    } else if (option.currentValue !== undefined) {
      defaults[option.id] = option.currentValue;
    }
  }

  return { catalog, defaults };
};

/** Apply session configuration into an in-memory provider config + Settings defaults patch. */
export const refreshProviderConfigInMemory = (
  previous: ProviderConfigStored | undefined,
  settingsDefaults: Readonly<Record<string, string>>,
  sessionConfiguration: unknown,
): ProviderConfigStored | undefined => {
  const selectable = normalizeSelectableConfigOptions(sessionConfiguration);
  if (selectable.length === 0) {
    return previous;
  }

  const baseline =
    previous ??
    (Object.keys(settingsDefaults).length > 0 ? { catalog: [] as const, defaults: settingsDefaults } : undefined);

  return mergeProviderConfigRefresh(baseline, selectable);
};

export const patchHarnessConfigDefaults = (
  settings: UserSettings,
  launchTarget: AgentLaunchTarget,
  defaults: Readonly<Record<string, string>>,
): UserSettings => ({
  ...settings,
  harnessConfigDefaults: {
    ...settings.harnessConfigDefaults,
    [launchTarget]: { ...defaults },
  },
});

/** Fire-and-forget disk persist for catalog (+ optional User settings write). */
export const persistProviderConfigDocuments = (
  launchTarget: AgentLaunchTarget,
  next: ProviderConfigStored,
  settings: UserSettings,
  persistSettings: boolean,
  hostLayer: Layer.Layer<HostServices>,
): void => {
  const effect = Effect.gen(function* () {
    yield* writeProviderConfigCatalog(launchTarget, { catalog: [...next.catalog] });
    if (persistSettings) {
      yield* writeUserSettings(settings);
    }
  }).pipe(
    Effect.provide(hostLayer),
    Effect.catchCause(cause => Effect.logWarning('provider config persist failed', launchTarget, cause)),
  );
  Effect.runFork(effect);
};

/** Load catalog from disk and pair with Settings defaults for one launch target. */
export const loadProviderConfig = Effect.fn('loadProviderConfig')(function* (
  launchTarget: AgentLaunchTarget,
  settingsDefaults: Readonly<Record<string, string>>,
) {
  const catalogDoc = yield* readProviderConfigCatalog(launchTarget);
  const catalog = Option.isSome(catalogDoc) ? catalogDoc.value.catalog : [];
  if (catalog.length === 0 && Object.keys(settingsDefaults).length === 0) {
    return undefined;
  }
  return { catalog, defaults: settingsDefaults } satisfies ProviderConfigStored;
});

export type HarnessDefaultDiff = {
  readonly configId: string;
  readonly value: string;
};

/** Config options where harness defaults differ from the session's current values and remain valid choices. */
export const harnessDefaultDiffs = (
  sessionConfiguration: unknown,
  defaults: Readonly<Record<string, string>>,
): readonly HarnessDefaultDiff[] =>
  normalizeSelectableConfigOptions(sessionConfiguration).flatMap(option => {
    if (!Object.hasOwn(defaults, option.id)) {
      return [];
    }
    const desired = defaults[option.id];
    if (desired === option.currentValue || !option.choices.some(choice => choice.id === desired)) {
      return [];
    }
    return [{ configId: option.id, value: desired }];
  });
