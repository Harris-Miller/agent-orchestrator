/**
 * The Session History row's app-owned facts — the **archived** flag and the **Last prompt time** — as typed fields.
 * Agents and the Tracked sessions store carry them as AIR meta (`_meta.jetbrains.air.archived` / `lastPromptAt`, hoa-home
 * ADR 0008); this module is the only place that encoding is read or written: rows are decoded where they enter (a
 * `session/list` / `session/new` result, a hydrated Tracked session) and encoded where they are stored.
 */
import { Predicate } from 'effect';

/** The typed facts a decoded row carries; an AIR-encoded row carries neither. */
export type HistoryRowFields = {
  /** Archived in the app (Show archived); absent when not. */
  readonly archived?: true;
  /** **Last prompt time**, ISO string. */
  readonly lastPromptTime?: string;
};

type Row = Readonly<Record<string, unknown>>;

type AirParts = {
  readonly air: Readonly<Record<string, unknown>>;
  readonly jetbrains: Readonly<Record<string, unknown>>;
  readonly meta: Readonly<Record<string, unknown>>;
};

const airPartsOf = (row: Row): AirParts => {
  const meta = Predicate.isObject(row._meta) ? row._meta : {};
  const jetbrains = Predicate.isObject(meta.jetbrains) ? meta.jetbrains : {};
  const air = Predicate.isObject(jetbrains.air) ? jetbrains.air : {};
  return { air, jetbrains, meta };
};

/** `row` with `air` as its AIR meta; drops the AIR (then jetbrains, then `_meta`) record when it is left empty. */
const withAir = <T extends Row>(row: T, { jetbrains, meta }: AirParts, air: Readonly<Record<string, unknown>>): T => {
  const { _meta: _dropped, ...rest } = row;
  const { air: _air, ...jetbrainsRest } = jetbrains;
  const nextJetbrains = Object.keys(air).length === 0 ? jetbrainsRest : { ...jetbrainsRest, air };
  const { jetbrains: _jetbrains, ...metaRest } = meta;
  const nextMeta = Object.keys(nextJetbrains).length === 0 ? metaRest : { ...metaRest, jetbrains: nextJetbrains };
  return (Object.keys(nextMeta).length === 0 ? rest : { ...rest, _meta: nextMeta }) as unknown as T;
};

/** A wire / stored row with its AIR `archived` and `lastPromptAt` lifted into typed fields (and out of `_meta`). */
export const decodeHistoryRow = <T extends Row>(row: T): T & HistoryRowFields => {
  const parts = airPartsOf(row);
  const { archived, lastPromptAt, ...air } = parts.air;
  if (archived === undefined && lastPromptAt === undefined) {
    return row;
  }
  const decoded: T = withAir(row, parts, air);
  return {
    ...decoded,
    ...(archived === true ? { archived: true as const } : {}),
    ...(typeof lastPromptAt === 'string' && lastPromptAt !== '' ? { lastPromptTime: lastPromptAt } : {}),
  };
};

/** A decoded row encoded for the Tracked sessions store: the typed fields back into AIR meta. */
export const encodeHistoryRow = <T extends Row & HistoryRowFields>(row: T): T => {
  const { archived, lastPromptTime, ...unfielded } = row;
  // Both fields are optional, so the row without them is still a `T`.
  const rest = unfielded as T;
  if (archived === undefined && lastPromptTime === undefined) {
    return rest;
  }
  const parts = airPartsOf(rest);
  return withAir(rest, parts, {
    ...parts.air,
    ...(archived === true ? { archived: true } : {}),
    ...(lastPromptTime === undefined ? {} : { lastPromptAt: lastPromptTime }),
  });
};

/** `row` archived or not. */
export const withArchived = <T extends HistoryRowFields & { readonly sessionId: string }>(
  row: T,
  archived: boolean,
): T => {
  if (archived) {
    return row.archived === true ? row : { ...row, archived: true };
  }
  if (row.archived === undefined) {
    return row;
  }
  const { archived: _archived, ...rest } = row;
  return rest as T;
};

/** `row` with its Last prompt time advanced to `at`: only when it already has one, never backwards. */
export const withLastPromptTime = <T extends HistoryRowFields & { readonly sessionId: string }>(
  row: T,
  at: string,
): T => {
  const incoming = Date.parse(at);
  const existing = row.lastPromptTime === undefined ? Number.NaN : Date.parse(row.lastPromptTime);
  return Number.isNaN(incoming) || Number.isNaN(existing) || incoming <= existing
    ? row
    : { ...row, lastPromptTime: at };
};
