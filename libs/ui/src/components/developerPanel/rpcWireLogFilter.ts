import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import type { RpcWireEntry } from '../../host/backendHarness.ts';
import { isRecord } from '../../isRecord.ts';

export const RPC_WIRE_FILTER_ALL = 'all';

/** Session bucket for wire rows with no ACP session id (initialize, etc.). */
export const RPC_WIRE_SYSTEM_SESSION_KEY = 'system';

export type RpcWireLaunchTargetFilter = AgentLaunchTarget | typeof RPC_WIRE_FILTER_ALL;

/** Resolve Session filter. `null` means match nothing (active-session mode with no selection). */
export const resolveSessionFilter = (
  activeSessionOnly: boolean,
  sessionFilter: string,
  activeSessionId: string | undefined,
): null | string => {
  if (activeSessionOnly) {
    return activeSessionId ?? null;
  }
  return sessionFilter;
};

/** Derived session/tag/id/title used for filtering and accordion labels. */
export type RpcWireRowMeta = {
  readonly sessionKey: string;
  readonly tag: null | string;
  readonly title: string;
  readonly wireId: null | string;
};

export type ClassifiedRpcWireEntry = {
  readonly entry: RpcWireEntry;
  readonly launchTarget: AgentLaunchTarget;
  readonly meta: RpcWireRowMeta;
};

export type RpcWireLogClassification = {
  readonly classified: readonly ClassifiedRpcWireEntry[];
  readonly sessionKeys: readonly string[];
};

export type RpcWireFilters = {
  readonly launchTarget: RpcWireLaunchTargetFilter;
  readonly sessionKey: string;
  readonly tag: string;
  readonly wireId: string;
};

type IdCacheEntry = {
  sessionKey: string;
  tag: string;
};

const tagLabelFromMessage = (message: Record<string, unknown>): null | string => {
  if (typeof message.tag !== 'string') {
    return null;
  }
  if (message.tag === 'session/update' && isRecord(message.payload) && isRecord(message.payload.update)) {
    const { sessionUpdate } = message.payload.update;
    if (typeof sessionUpdate === 'string') {
      return `${message.tag} ${sessionUpdate}`;
    }
  }
  return message.tag;
};

const payloadSessionId = (message: Record<string, unknown>): null | string => {
  if (!isRecord(message.payload)) {
    return null;
  }
  return typeof message.payload.sessionId === 'string' ? message.payload.sessionId : null;
};

const exitSuccessSessionId = (message: Record<string, unknown>): null | string => {
  if (message._tag !== 'Exit' || !isRecord(message.exit) || message.exit._tag !== 'Success') {
    return null;
  }
  if (!isRecord(message.exit.value)) {
    return null;
  }
  return typeof message.exit.value.sessionId === 'string' ? message.exit.value.sessionId : null;
};

const wireIdString = (value: unknown): null | string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return null;
};

const wireIdFromMessage = (message: Record<string, unknown>): null | string =>
  wireIdString(message.id) ?? wireIdString(message.requestId);

const titleFallback = (message: Record<string, unknown>): string => {
  if (typeof message.method === 'string') {
    return message.method;
  }
  if ('error' in message) {
    return 'error';
  }
  if ('result' in message) {
    return 'response';
  }
  return 'message';
};

/** JSON-RPC ids are per sender: a client request and an agent request may share an id. Key by the requester. */
const requesterKey = (requester: RpcWireEntry['direction'], id: string): string => `${requester}:${id}`;

/** Notifications carry id "" (no JSON-RPC id), so they can never be correlated with anything. */
const isNotificationMessage = (message: Record<string, unknown>): boolean =>
  message.isNotification === true || message.id === '';

/** Cache key of the request this message is, or responds to; `null` for notifications / uncorrelatable rows. */
const correlationKey = (entry: RpcWireEntry, message: Record<string, unknown>): null | string => {
  if (isNotificationMessage(message)) {
    return null;
  }
  const requestId = wireIdString(message.requestId);
  if (requestId != null) {
    // A response travels opposite to the request it answers.
    return requesterKey(entry.direction === 'out' ? 'in' : 'out', requestId);
  }
  const ownId = wireIdString(message.id);
  return ownId == null ? null : requesterKey(entry.direction, ownId);
};

const buildIdCache = (entries: readonly RpcWireEntry[]): Map<string, IdCacheEntry> => {
  const cache = new Map<string, IdCacheEntry>();

  for (const entry of entries) {
    if (isRecord(entry.message)) {
      const { message } = entry;
      const key = message.requestId === undefined ? correlationKey(entry, message) : null;
      if (typeof message.tag === 'string' && key != null) {
        const tag = tagLabelFromMessage(message) ?? message.tag;
        cache.set(key, {
          sessionKey: payloadSessionId(message) ?? RPC_WIRE_SYSTEM_SESSION_KEY,
          tag,
        });
      }
    }
  }

  for (const entry of entries) {
    const message = isRecord(entry.message) ? entry.message : null;
    const key = message?.requestId === undefined ? null : correlationKey(entry, message);
    const cached = key == null ? undefined : cache.get(key);
    const sessionId = message != null && cached?.tag === 'session/new' ? exitSuccessSessionId(message) : null;
    if (key != null && cached != null && sessionId != null) {
      cache.set(key, { sessionKey: sessionId, tag: cached.tag });
    }
  }

  return cache;
};

const metaForEntry = (entry: RpcWireEntry, cache: ReadonlyMap<string, IdCacheEntry>): RpcWireRowMeta => {
  const arrow = entry.direction === 'out' ? '→' : '←';
  if (!isRecord(entry.message)) {
    return { sessionKey: RPC_WIRE_SYSTEM_SESSION_KEY, tag: null, title: `${arrow} message`, wireId: null };
  }

  const { message } = entry;
  const wireId = isNotificationMessage(message) ? null : wireIdFromMessage(message);
  const key = correlationKey(entry, message);
  const requestCache = key == null ? undefined : cache.get(key);

  const tagFromMessage = tagLabelFromMessage(message);
  const tag = tagFromMessage ?? requestCache?.tag ?? null;

  const newSessionId = exitSuccessSessionId(message);
  const sessionKey =
    payloadSessionId(message) ?? newSessionId ?? requestCache?.sessionKey ?? RPC_WIRE_SYSTEM_SESSION_KEY;

  const titleLabel = tag ?? (entry.direction === 'out' ? titleFallback(message) : 'message');

  return {
    sessionKey,
    tag,
    title: `${arrow} ${titleLabel}`,
    wireId,
  };
};

const uniqueInOrder = (values: readonly (null | string)[]): readonly string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (value != null && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
};

/** Classify one launch target's log (id correlation stays scoped to that target). */
export const classifyRpcWireLog = (
  entries: readonly RpcWireEntry[],
  launchTarget: AgentLaunchTarget,
): RpcWireLogClassification => {
  const cache = buildIdCache(entries);
  const classified = entries.map((entry): ClassifiedRpcWireEntry => ({
    entry,
    launchTarget,
    meta: metaForEntry(entry, cache),
  }));

  const sessionKeys = uniqueInOrder(classified.map(row => row.meta.sessionKey));

  return { classified, sessionKeys };
};

/** Merge per-launch-target classifications; sort by capture time. */
export const mergeClassifiedRpcWireLogs = (parts: readonly RpcWireLogClassification[]): RpcWireLogClassification => {
  const classified = parts
    .flatMap(part => part.classified)
    .toSorted((left, right) => left.entry.receivedAt - right.entry.receivedAt);
  return {
    classified,
    sessionKeys: uniqueInOrder(classified.map(row => row.meta.sessionKey)),
  };
};

export const sessionKeysForLaunchTarget = (
  classified: readonly ClassifiedRpcWireEntry[],
  launchTarget: RpcWireLaunchTargetFilter,
): readonly string[] =>
  uniqueInOrder(
    classified
      .filter(row => launchTarget === RPC_WIRE_FILTER_ALL || row.launchTarget === launchTarget)
      .map(row => row.meta.sessionKey),
  );

export const filterClassifiedRpcWireEntries = (
  classified: readonly ClassifiedRpcWireEntry[],
  filters: RpcWireFilters,
): readonly ClassifiedRpcWireEntry[] =>
  classified.filter(row => {
    if (filters.launchTarget !== RPC_WIRE_FILTER_ALL && row.launchTarget !== filters.launchTarget) {
      return false;
    }
    if (filters.sessionKey !== RPC_WIRE_FILTER_ALL && row.meta.sessionKey !== filters.sessionKey) {
      return false;
    }
    if (filters.tag !== RPC_WIRE_FILTER_ALL && row.meta.tag !== filters.tag) {
      return false;
    }
    if (filters.wireId !== RPC_WIRE_FILTER_ALL && row.meta.wireId !== filters.wireId) {
      return false;
    }
    return true;
  });

export const cascadedWireIds = (
  classified: readonly ClassifiedRpcWireEntry[],
  filters: Pick<RpcWireFilters, 'launchTarget' | 'sessionKey' | 'tag'>,
): readonly string[] =>
  uniqueInOrder(
    filterClassifiedRpcWireEntries(classified, {
      ...filters,
      wireId: RPC_WIRE_FILTER_ALL,
    }).map(row => row.meta.wireId),
  );

/** A filter value no longer among its options falls back to All. */
export const coerceToAvailable = (value: string, available: readonly string[]): string =>
  value === RPC_WIRE_FILTER_ALL || available.includes(value) ? value : RPC_WIRE_FILTER_ALL;

/** Tags present in the launchTarget + session slice (`sessionKey: null` = match nothing). */
export const cascadedTags = (
  classified: readonly ClassifiedRpcWireEntry[],
  filters: { readonly launchTarget: RpcWireLaunchTargetFilter; readonly sessionKey: null | string },
): readonly string[] =>
  filters.sessionKey === null
    ? []
    : uniqueInOrder(
        filterClassifiedRpcWireEntries(classified, {
          launchTarget: filters.launchTarget,
          sessionKey: filters.sessionKey,
          tag: RPC_WIRE_FILTER_ALL,
          wireId: RPC_WIRE_FILTER_ALL,
        }).map(row => row.meta.tag),
      );
