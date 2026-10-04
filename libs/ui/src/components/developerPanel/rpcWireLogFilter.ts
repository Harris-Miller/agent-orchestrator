import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import type { RpcWireEntry } from '../../host/backendHarness.ts';
import { isRecord } from '../../isRecord.ts';

export const RPC_WIRE_FILTER_ALL = 'all';

export type RpcWireProviderFilter = AgentLaunchTarget | typeof RPC_WIRE_FILTER_ALL;

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
  readonly tags: readonly string[];
};

export type RpcWireFilters = {
  readonly provider: RpcWireProviderFilter;
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

const metaForEntry = (entry: RpcWireEntry, cache: ReadonlyMap<string, IdCacheEntry>): RpcWireRowMeta => {
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
  const tags = uniqueInOrder(classified.map(row => row.meta.tag));

  return { classified, sessionKeys, tags };
};

/** Merge per-launch-target classifications; sort by capture time. */
export const mergeClassifiedRpcWireLogs = (parts: readonly RpcWireLogClassification[]): RpcWireLogClassification => {
  const classified = parts
    .flatMap(part => part.classified)
    .toSorted((left, right) => left.entry.receivedAt - right.entry.receivedAt);
  return {
    classified,
    sessionKeys: uniqueInOrder(classified.map(row => row.meta.sessionKey)),
    tags: uniqueInOrder(classified.map(row => row.meta.tag)),
  };
};

export const sessionKeysForProvider = (
  classified: readonly ClassifiedRpcWireEntry[],
  provider: RpcWireProviderFilter,
): readonly string[] =>
  uniqueInOrder(
    classified
      .filter(row => provider === RPC_WIRE_FILTER_ALL || row.launchTarget === provider)
      .map(row => row.meta.sessionKey),
  );

export const filterClassifiedRpcWireEntries = (
  classified: readonly ClassifiedRpcWireEntry[],
  filters: RpcWireFilters,
): readonly ClassifiedRpcWireEntry[] =>
  classified.filter(row => {
    if (filters.provider !== RPC_WIRE_FILTER_ALL && row.launchTarget !== filters.provider) {
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
  filters: Pick<RpcWireFilters, 'provider' | 'sessionKey' | 'tag'>,
): readonly string[] =>
  uniqueInOrder(
    filterClassifiedRpcWireEntries(classified, {
      ...filters,
      wireId: RPC_WIRE_FILTER_ALL,
    }).map(row => row.meta.wireId),
  );

export const coerceWireIdFilter = (wireId: string, available: readonly string[]): string => {
  if (wireId === RPC_WIRE_FILTER_ALL) {
    return RPC_WIRE_FILTER_ALL;
  }
  return available.includes(wireId) ? wireId : RPC_WIRE_FILTER_ALL;
};

export const coerceWireIdAgainstCascade = (
  classified: readonly ClassifiedRpcWireEntry[],
  filters: Pick<RpcWireFilters, 'provider' | 'sessionKey' | 'tag'>,
  wireId: string,
): string => coerceWireIdFilter(wireId, cascadedWireIds(classified, filters));
