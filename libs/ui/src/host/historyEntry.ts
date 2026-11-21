/**
 * A History entry's (Session History row's) app-owned facts — the **archived** flag and the **Last prompt time** — as typed fields.
 * Agents and the Tracked sessions store carry them as AIR meta (`_meta.jetbrains.air.archived` / `lastPromptAt`, hoa-home
 * ADR 0008); this module is the only place that encoding is read or written: rows are decoded where they enter (a
 * `session/list` / `session/new` result, a hydrated Tracked session) and encoded where they are stored.
 */
import { Predicate, Schema } from 'effect';

/** The typed facts a decoded row carries; an AIR-encoded row carries neither. */
export type HistoryEntryFields = {
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

const isArchivedFlag = Schema.is(Schema.Literal(true));
const isPromptTime = Schema.is(Schema.NonEmptyString);

/**
 * A wire / stored row with its AIR `archived` and `lastPromptAt` lifted into typed fields (and out of `_meta`). Top-level
 * `archived` / `lastPromptTime` keys a wire row may carry are not trusted: only the AIR meta sets them.
 */
export const decodeHistoryEntry = <T extends Row>(row: T): T & HistoryEntryFields => {
  const { archived: _archived, lastPromptTime: _lastPromptTime, ...untrusted } = row;
  const unfielded = untrusted as T;
  const parts = airPartsOf(unfielded);
  const { archived, lastPromptAt, ...air } = parts.air;
  const decoded = archived === undefined && lastPromptAt === undefined ? unfielded : withAir(unfielded, parts, air);
  return {
    ...decoded,
    ...(isArchivedFlag(archived) ? { archived: true as const } : {}),
    ...(isPromptTime(lastPromptAt) ? { lastPromptTime: lastPromptAt } : {}),
  };
};

/** A decoded row encoded for the Tracked sessions store: the typed fields back into AIR meta. */
export const encodeHistoryEntry = <T extends Row & HistoryEntryFields>(row: T): T => {
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
export const withArchived = <T extends HistoryEntryFields & { readonly sessionId: string }>(
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
export const withLastPromptTime = <T extends HistoryEntryFields & { readonly sessionId: string }>(
  row: T,
  at: string,
): T => {
  const incoming = Date.parse(at);
  const existing = row.lastPromptTime === undefined ? Number.NaN : Date.parse(row.lastPromptTime);
  return Number.isNaN(incoming) || Number.isNaN(existing) || incoming <= existing
    ? row
    : { ...row, lastPromptTime: at };
};
