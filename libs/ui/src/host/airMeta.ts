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

/** `entry` with `_meta.jetbrains.air.lastPromptAt` advanced to `at`: only when the row already carries one, never backwards; the rest of `_meta` is kept. */
export const withLastPromptAt = <T extends Readonly<Record<string, unknown>>>(entry: T, at: string): T => {
  const current = airOf(entry)?.lastPromptAt;
  const incoming = Date.parse(at);
  const existing = typeof current === 'string' ? Date.parse(current) : Number.NaN;
  if (Number.isNaN(incoming) || Number.isNaN(existing) || incoming <= existing) {
    return entry;
  }
  const meta = Predicate.isObject(entry._meta) ? entry._meta : {};
  const jetbrains = Predicate.isObject(meta.jetbrains) ? meta.jetbrains : {};
  const air = Predicate.isObject(jetbrains.air) ? jetbrains.air : {};
  return { ...entry, _meta: { ...meta, jetbrains: { ...jetbrains, air: { ...air, lastPromptAt: at } } } };
};

/** Activity state of a `session/list` row that earns a badge; `idle` and unknown states read as absent. */
export type AirActivityState = 'error' | 'requires_action' | 'running';

/** The AIR row metadata Session History shows. Each field is decoded on its own: a malformed one drops only itself. */
export type AirRowMeta = {
  readonly activityState?: AirActivityState;
  readonly cost?: { readonly amount: number; readonly currency: string };
  /** Session id this Session was forked from (the **Fork source**). */
  readonly forkSource?: string;
  /** **Last prompt time**, ISO string. */
  readonly lastPromptAt?: string;
  readonly model?: string;
};

const isActivityState = (value: unknown): value is AirActivityState =>
  value === 'running' || value === 'requires_action' || value === 'error';

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** The AIR row metadata of a `session/list` row (`_meta.jetbrains.air`); rows without it read as `{}`. */
export const airRowMetaOf = (entry: Readonly<Record<string, unknown>>): AirRowMeta => {
  const air = airOf(entry);
  if (air === undefined) {
    return {};
  }
  const { cost } = air;
  const currency = Predicate.isObject(cost) ? nonEmptyString(cost.currency) : undefined;
  const amount =
    Predicate.isObject(cost) && typeof cost.amount === 'number' && Number.isFinite(cost.amount)
      ? cost.amount
      : undefined;
  const lastPromptAt = nonEmptyString(air.lastPromptAt);
  const model = nonEmptyString(air.model);
  const forkSource = nonEmptyString(air.forkedFrom);
  return {
    ...(isActivityState(air.state) ? { activityState: air.state } : {}),
    ...(amount !== undefined && currency !== undefined ? { cost: { amount, currency } } : {}),
    ...(forkSource === undefined ? {} : { forkSource }),
    ...(lastPromptAt === undefined ? {} : { lastPromptAt }),
    ...(model === undefined ? {} : { model }),
  };
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
