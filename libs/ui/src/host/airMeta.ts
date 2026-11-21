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

/** `entry` without a `running` / `requires_action` `_meta.jetbrains.air.state` (stale once its turn ends); `error`, unknown or absent state: unchanged. The rest of `_meta` is kept. */
export const withoutLiveActivityState = <T extends Readonly<Record<string, unknown>>>(entry: T): T => {
  const air = airOf(entry);
  if (air === undefined || (air.state !== 'running' && air.state !== 'requires_action')) {
    return entry;
  }
  const { state: _state, ...rest } = air;
  const meta = entry._meta as { jetbrains: Record<string, unknown> };
  return { ...entry, _meta: { ...meta, jetbrains: { ...meta.jetbrains, air: rest } } };
};

/** Activity state of a `session/list` row that earns a badge; `idle` and unknown states read as absent. */
export type AirActivityState = 'error' | 'requires_action' | 'running';

/** The AIR row metadata Session History shows (archived and Last prompt time are typed row fields, `sessionHistoryRow.ts`). Each field is decoded on its own: a malformed one drops only itself. */
export type AirRowMeta = {
  readonly activityState?: AirActivityState;
  readonly cost?: { readonly amount: number; readonly currency: string };
  /** Session id this Session was forked from (the **Fork source**). */
  readonly forkSource?: string;
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
  const model = nonEmptyString(air.model);
  const forkSource = nonEmptyString(air.forkedFrom);
  return {
    ...(isActivityState(air.state) ? { activityState: air.state } : {}),
    ...(amount !== undefined && currency !== undefined ? { cost: { amount, currency } } : {}),
    ...(forkSource === undefined ? {} : { forkSource }),
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
