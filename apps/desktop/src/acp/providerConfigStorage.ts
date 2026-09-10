/** Persist provider config catalog + harness defaults per agent launch target. */

import { isRecord } from '../utils.ts';

import type { NormalizedConfigChoice, NormalizedConfigOption } from './acpSessionBootstrap.ts';
import { normalizeSelectableConfigOptions } from './acpSessionBootstrap.ts';
import type { AcpAgentBackend } from './agentHarness.ts';

const PROVIDER_CONFIG_KEY_PREFIX = 'acp-provider-config:';

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

const providerConfigKey = (backend: AcpAgentBackend): string => `${PROVIDER_CONFIG_KEY_PREFIX}${backend}`;

const parseChoices = (value: unknown): readonly NormalizedConfigChoice[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const choices: NormalizedConfigChoice[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      return undefined;
    }
    choices.push({
      ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      id: entry.id,
      name: entry.name,
    });
  }
  return choices;
};

const parseCatalog = (value: unknown): readonly ProviderConfigCatalogEntry[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const catalog: ProviderConfigCatalogEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      return undefined;
    }
    const choices = parseChoices(entry.choices);
    if (choices === undefined) {
      return undefined;
    }
    catalog.push({
      ...(typeof entry.category === 'string' ? { category: entry.category } : {}),
      choices,
      ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      id: entry.id,
      name: entry.name,
    });
  }
  return catalog;
};

const parseDefaults = (value: unknown): Readonly<Record<string, string>> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const defaults: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      return undefined;
    }
    defaults[key] = entry;
  }
  return defaults;
};

const parseStored = (value: unknown): ProviderConfigStored | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const catalog = parseCatalog(value.catalog);
  const defaults = parseDefaults(value.defaults);
  if (catalog === undefined || defaults === undefined) {
    return undefined;
  }
  return { catalog, defaults };
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
    choices: option.choices,
    ...(option.description !== undefined ? { description: option.description } : {}),
    id: option.id,
    name: option.name,
  }));

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

export const readProviderConfig = (backend: AcpAgentBackend): ProviderConfigStored | undefined => {
  try {
    const raw = localStorage.getItem(providerConfigKey(backend));
    if (raw == null) {
      return undefined;
    }
    return parseStored(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
};

export const persistProviderConfig = (backend: AcpAgentBackend, stored: ProviderConfigStored): void => {
  localStorage.setItem(providerConfigKey(backend), JSON.stringify(stored));
};

/**
 * Refresh catalog from session configuration. Skips when there are no selectable options.
 * Seeds defaults on first write; preserves valid defaults on later refreshes.
 */
export const refreshCatalogFromSessionConfiguration = (
  backend: AcpAgentBackend,
  sessionConfiguration: unknown,
): ProviderConfigStored | undefined => {
  const selectable = normalizeSelectableConfigOptions(sessionConfiguration);
  if (selectable.length === 0) {
    return readProviderConfig(backend);
  }

  const next = mergeProviderConfigRefresh(readProviderConfig(backend), selectable);
  persistProviderConfig(backend, next);
  return next;
};

/** Replace harness defaults with the given values; keeps existing catalog. */
export const saveHarnessDefaults = (
  backend: AcpAgentBackend,
  values: Readonly<Record<string, string>>,
): ProviderConfigStored => {
  const existing = readProviderConfig(backend) ?? { catalog: [], defaults: {} };
  const next: ProviderConfigStored = {
    catalog: existing.catalog,
    defaults: { ...values },
  };
  persistProviderConfig(backend, next);
  return next;
};

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
