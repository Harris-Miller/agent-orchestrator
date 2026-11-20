/** JetBrains AIR `_meta.jetbrains.air` envelope. Initialize and `session/list` share it. */

import { SessionFailure } from '@libs/effect-acp';
import { Option, Predicate, Schema } from 'effect';

export const airCapability = {
  backgroundSubagents: 'backgroundSubagents',
  loadReplayEnd: 'loadReplayEnd',
  recommendedValue: 'recommendedValue',
  sessionArchive: 'sessionArchive',
  sessionFailure: 'sessionFailure',
  sessionIndex: 'sessionIndex',
  sessionListSubscribe: 'sessionListSubscribe',
  sessionRename: 'sessionRename',
} as const;

export type AirCapability = (typeof airCapability)[keyof typeof airCapability];

export const airMeta = <Body extends object>(body: Body) => ({
  jetbrains: {
    air: {
      ...body,
      version: 1 as const,
    },
  },
});

/** The `_meta.jetbrains.air` record of `entry`, or undefined when absent. */
const airOf = (entry: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> | undefined => {
  const { _meta: meta } = entry;
  if (!Predicate.isObject(meta) || !Predicate.isObject(meta.jetbrains) || !Predicate.isObject(meta.jetbrains.air)) {
    return undefined;
  }
  return meta.jetbrains.air;
};

/** True when a `session/list` row carries `_meta.jetbrains.air.archived === true`. */
export const isArchivedEntry = (entry: Readonly<Record<string, unknown>>): boolean => {
  return airOf(entry)?.archived === true;
};

/** `entry` with `_meta.jetbrains.air.archived` set to `archived`; the rest of `_meta` is kept. */
export const withArchived = <T extends Readonly<Record<string, unknown>>>(entry: T, archived: boolean): T => {
  const meta = Predicate.isObject(entry._meta) ? entry._meta : {};
  const jetbrains = Predicate.isObject(meta.jetbrains) ? meta.jetbrains : {};
  const air = Predicate.isObject(jetbrains.air) ? jetbrains.air : {};
  return { ...entry, _meta: { ...meta, jetbrains: { ...jetbrains, air: { ...air, archived } } } };
};

/** True when an ACP available command is a skill: AIR `kind: 'skill'`, an AIR `skillPath`, or a Codex `$name`. */
export const isSkillCommand = (entry: Readonly<Record<string, unknown>>): boolean => {
  const { name } = entry;
  if (typeof name === 'string' && name.startsWith('$')) {
    return true;
  }
  const air = airOf(entry);
  return air?.kind === 'skill' || typeof air?.skillPath === 'string';
};

const decodeSessionFailure = Schema.decodeUnknownOption(SessionFailure);

/** The AIR `_meta.jetbrains.air.sessionFailure` payload of an update / response `_meta`; malformed reads as None. */
export const sessionFailureOf = (meta: unknown): Option.Option<SessionFailure> => {
  if (!Predicate.isObject(meta) || !Predicate.isObject(meta.jetbrains) || !Predicate.isObject(meta.jetbrains.air)) {
    return Option.none();
  }
  return decodeSessionFailure(meta.jetbrains.air.sessionFailure);
};

/** True when a `session_info_update` carries `_meta.jetbrains.air.loadReplayEnd === true` (end of a `session/load` replay). */
export const isLoadReplayEnd = (update: Readonly<Record<string, unknown>>): boolean => {
  return airOf(update)?.loadReplayEnd === true;
};

/** The AIR `_meta.jetbrains.air.recommendedValue` of a select config option: the choice the agent suggests, or undefined. */
export const recommendedValueOf = (entry: Readonly<Record<string, unknown>>): string | undefined => {
  const value = airOf(entry)?.recommendedValue;
  return typeof value === 'string' ? value : undefined;
};
