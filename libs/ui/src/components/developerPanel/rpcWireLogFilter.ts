import type { RpcWireEntry } from '../../host/backendHarness.ts';
import { isRecord } from '../../isRecord.ts';

export const RPC_WIRE_FILTER_ALL = 'all';
export const RPC_WIRE_FILTER_ACTIVE_SESSION = 'active-session';

/** Resolve Session select value. `null` means match nothing (active session chosen, none selected). */
export const resolveSessionFilter = (sessionFilter: string, activeSessionId: string | undefined): null | string => {
  if (sessionFilter !== RPC_WIRE_FILTER_ACTIVE_SESSION) {
    return sessionFilter;
  }
  return activeSessionId ?? null;
};

export type RpcWireFacet = {
  readonly sessionKey: string;
  readonly tag: null | string;
  readonly title: string;
  readonly wireId: null | string;
};

export type ClassifiedRpcWireEntry = {
  readonly entry: RpcWireEntry;
  readonly facet: RpcWireFacet;
};

export type RpcWireLogClassification = {
  readonly classified: readonly ClassifiedRpcWireEntry[];
  readonly sessionKeys: readonly string[];
  readonly tags: readonly string[];
};

export type RpcWireFilters = {
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

const buildIdCache = (entries: readonly RpcWireEntry[]): Map<string, IdCacheEntry> => {
  const cache = new Map<string, IdCacheEntry>();

  for (const entry of entries) {
    if (isRecord(entry.message)) {
      const { message } = entry;
      const id = wireIdString(message.id);
      if (typeof message.tag === 'string' && id != null) {
        const tag = tagLabelFromMessage(message) ?? message.tag;
        cache.set(id, {
          sessionKey: payloadSessionId(message) ?? 'system',
          tag,
        });
      }
    }
  }

  for (const entry of entries) {
    const message = isRecord(entry.message) ? entry.message : null;
    const requestId = message == null ? null : wireIdString(message.requestId);
    const cached = requestId == null ? undefined : cache.get(requestId);
    const sessionId = message != null && cached?.tag === 'session/new' ? exitSuccessSessionId(message) : null;
    if (requestId != null && cached != null && sessionId != null) {
      cache.set(requestId, { sessionKey: sessionId, tag: cached.tag });
    }
  }

  return cache;
};

const facetForEntry = (entry: RpcWireEntry, cache: ReadonlyMap<string, IdCacheEntry>): RpcWireFacet => {
  const arrow = entry.direction === 'out' ? '→' : '←';
  if (!isRecord(entry.message)) {
    return { sessionKey: 'system', tag: null, title: `${arrow} message`, wireId: null };
  }

  const { message } = entry;
  const wireId = wireIdFromMessage(message);
  const requestId = wireIdString(message.requestId);
  const ownId = wireIdString(message.id);
  const requestCache = requestId != null ? cache.get(requestId) : ownId != null ? cache.get(ownId) : undefined;

  const tagFromMessage = tagLabelFromMessage(message);
  const tag = tagFromMessage ?? requestCache?.tag ?? null;

  const newSessionId = exitSuccessSessionId(message);
  const sessionKey = payloadSessionId(message) ?? newSessionId ?? requestCache?.sessionKey ?? 'system';

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

export const classifyRpcWireLog = (entries: readonly RpcWireEntry[]): RpcWireLogClassification => {
  const cache = buildIdCache(entries);
  const classified = entries.map((entry): ClassifiedRpcWireEntry => ({
    entry,
    facet: facetForEntry(entry, cache),
  }));

  const sessionKeys = uniqueInOrder(classified.map(row => row.facet.sessionKey));
  const tags = uniqueInOrder(classified.map(row => row.facet.tag));

  return { classified, sessionKeys, tags };
};

export const filterClassifiedRpcWireEntries = (
  classified: readonly ClassifiedRpcWireEntry[],
  filters: RpcWireFilters,
): readonly ClassifiedRpcWireEntry[] =>
  classified.filter(row => {
    if (filters.sessionKey !== RPC_WIRE_FILTER_ALL && row.facet.sessionKey !== filters.sessionKey) {
      return false;
    }
    if (filters.tag !== RPC_WIRE_FILTER_ALL && row.facet.tag !== filters.tag) {
      return false;
    }
    if (filters.wireId !== RPC_WIRE_FILTER_ALL && row.facet.wireId !== filters.wireId) {
      return false;
    }
    return true;
  });

export const cascadedWireIds = (
  classified: readonly ClassifiedRpcWireEntry[],
  filters: Pick<RpcWireFilters, 'sessionKey' | 'tag'>,
): readonly string[] =>
  uniqueInOrder(
    filterClassifiedRpcWireEntries(classified, {
      ...filters,
      wireId: RPC_WIRE_FILTER_ALL,
    }).map(row => row.facet.wireId),
  );

export const coerceWireIdFilter = (wireId: string, available: readonly string[]): string => {
  if (wireId === RPC_WIRE_FILTER_ALL) {
    return RPC_WIRE_FILTER_ALL;
  }
  return available.includes(wireId) ? wireId : RPC_WIRE_FILTER_ALL;
};
