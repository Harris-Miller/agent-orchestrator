/** JetBrains AIR `_meta.jetbrains.air` envelope. Initialize and `session/list` share it. */

import { SessionFailure } from '@libs/effect-acp';
import { Option, Predicate, Schema } from 'effect';

export const airCapability = {
  sessionArchive: 'sessionArchive',
  sessionFailure: 'sessionFailure',
  sessionIndex: 'sessionIndex',
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

/** True when a `session/list` row carries `_meta.jetbrains.air.archived === true`. */
export const isArchivedEntry = (entry: Readonly<Record<string, unknown>>): boolean => {
  const { _meta: meta } = entry;
  if (!Predicate.isObject(meta) || !Predicate.isObject(meta.jetbrains) || !Predicate.isObject(meta.jetbrains.air)) {
    return false;
  }
  return meta.jetbrains.air.archived === true;
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
  const { _meta: meta, name } = entry;
  if (typeof name === 'string' && name.startsWith('$')) {
    return true;
  }
  if (!Predicate.isObject(meta) || !Predicate.isObject(meta.jetbrains) || !Predicate.isObject(meta.jetbrains.air)) {
    return false;
  }
  const { air } = meta.jetbrains;
  return air.kind === 'skill' || typeof air.skillPath === 'string';
};

const decodeSessionFailure = Schema.decodeUnknownOption(SessionFailure);

/** The AIR `_meta.jetbrains.air.sessionFailure` payload of an update / response `_meta`; malformed reads as None. */
export const sessionFailureOf = (meta: unknown): Option.Option<SessionFailure> => {
  if (!Predicate.isObject(meta) || !Predicate.isObject(meta.jetbrains) || !Predicate.isObject(meta.jetbrains.air)) {
    return Option.none();
  }
  return decodeSessionFailure(meta.jetbrains.air.sessionFailure);
};
