/** Session configuration (glossary): pure folds of agent Config option reports and local value writes. */
import { isRecord } from '../isRecord.ts';

import { airMeta } from './airMeta.ts';
import { normalizeConfigOptions } from './acpSessionBootstrap.ts';
import type { NormalizedConfigOption, SessionConfiguration } from './acpSessionBootstrap.ts';
import type { ConfigOptionValues } from './configProbe.ts';

/** One option value to set on a Session. */
export type ConfigValueDiff =
  | { readonly configId: string; readonly type: 'boolean'; readonly value: boolean }
  | { readonly configId: string; readonly type: 'select'; readonly value: string };

/** The wire shape of a typed option, so a report entry can inherit the fields it omits. */
const reportEntryOf = (option: NormalizedConfigOption): Record<string, unknown> => {
  if (option.type === 'boolean') {
    return option;
  }
  const { choices, recommendedValue, ...rest } = option;
  return {
    ...rest,
    ...(recommendedValue === undefined ? {} : { _meta: airMeta({ recommendedValue }) }),
    options: choices.map(({ id, ...choice }) => ({ ...choice, value: id })),
  };
};

/**
 * Fold an agent Config option report (a `session/set_config_option` response or a config option update) into a
 * Session configuration. The report's `configOptions` is the full id set: absent ids drop, new ids appear (desktop
 * ADR-0007). A reported option inherits each field it omits from the previous option with the same id (its choices
 * when `options` is not an array). A report without `configOptions` returns `configuration` unchanged.
 */
export const foldConfigOptions = (
  configuration: SessionConfiguration | undefined,
  report: unknown,
): SessionConfiguration | undefined => {
  if (!isRecord(report) || !Array.isArray(report.configOptions)) {
    return configuration;
  }
  const previousById = new Map((configuration ?? []).map(option => [option.id, option]));
  const configOptions = report.configOptions.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== 'string') {
      return entry;
    }
    const previous = previousById.get(entry.id);
    if (previous === undefined) {
      return entry;
    }
    const inherited = reportEntryOf(previous);
    return { ...inherited, ...entry, options: Array.isArray(entry.options) ? entry.options : inherited.options };
  });
  return normalizeConfigOptions({ configOptions });
};

/** The current value of `configId`, if the configuration has that option. */
export const configValue = (
  configuration: SessionConfiguration | undefined,
  configId: string,
): boolean | string | undefined => configuration?.find(option => option.id === configId)?.currentValue;

/**
 * Set `configId`'s current value. Changes nothing for an unknown id or a value that does not fit the option's type;
 * `undefined` clears the value.
 */
export const withConfigValue = (
  configuration: SessionConfiguration,
  configId: string,
  value: boolean | string | undefined,
): SessionConfiguration =>
  configuration.map(option => {
    if (option.id !== configId) {
      return option;
    }
    if (option.type === 'select') {
      return value === undefined || typeof value === 'string' ? { ...option, currentValue: value } : option;
    }
    return value === undefined || typeof value === 'boolean' ? { ...option, currentValue: value } : option;
  });

/** Config options where desired values differ from the session's current values and remain valid. */
export const configValueDiffs = (
  configuration: SessionConfiguration,
  values: ConfigOptionValues,
): readonly ConfigValueDiff[] =>
  configuration.flatMap((option): readonly ConfigValueDiff[] => {
    if (!Object.hasOwn(values, option.id)) {
      return [];
    }
    const desired = values[option.id];
    if (option.type === 'select') {
      if (typeof desired !== 'string') {
        return [];
      }
      if (desired === option.currentValue || !option.choices.some(choice => choice.id === desired)) {
        return [];
      }
      return [{ configId: option.id, type: 'select', value: desired }];
    }
    if (typeof desired !== 'boolean' || desired === option.currentValue) {
      return [];
    }
    return [{ configId: option.id, type: 'boolean', value: desired }];
  });
