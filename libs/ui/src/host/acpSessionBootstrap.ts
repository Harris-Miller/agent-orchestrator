/** Bootstrap phase model and normalizers for ACP session startup. */

import type { SessionUsageDocument } from '@lib/ao-home';
import type { Cause } from 'effect';

import { isRecord } from '../isRecord.ts';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import type { HarnessFailure } from './harnessFailure.ts';
import { airCapability } from './airMeta.ts';
import type { RpcWireEntry } from './backendHarness.ts';
import type { PendingElicitation, PendingPermission } from './pendingInteractions.ts';
import type { AvailableCommand, SessionTranscript } from './sessionUpdateReducer.ts';
import { emptySessionTranscript } from './sessionUpdateReducer.ts';

export type AcpBootstrapPhase = 'connecting' | 'error' | 'initialized' | 'probing' | 'ready' | 'signing-in';

export type SessionStatus = 'activating' | 'active' | 'inactive';

/** True while load/resume is in flight or the session is loaded on the agent. */
export const isSessionActiveOrActivating = (status: SessionStatus): boolean =>
  status === 'active' || status === 'activating';

export type PendingClientRequestKind = 'config' | 'prompt';

export type SessionSnapshot = {
  readonly availableCommands?: readonly AvailableCommand[];
  /** Session cwd when known (create, handoff, or activate resolve). Absent until stamped. */
  readonly cwd?: string;
  /** Die defects from a failed `session/load` or `session/resume` Exit cause. Cleared on re-activate. */
  readonly defects?: readonly unknown[];
  /** Outstanding client→agent RPC kind; absent/undefined when none. */
  readonly pendingClientRequest?: PendingClientRequestKind | undefined;
  readonly pendingElicitation?: PendingElicitation;
  readonly pendingPermission?: PendingPermission;
  /** Set when the user requested Prompt turn cancel; cleared with pending client request. */
  readonly promptCancelRequested?: boolean;
  readonly selectedModeId?: string;
  readonly selectedModelId?: string;
  readonly sessionConfiguration?: unknown;
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly transcript: SessionTranscript;
  readonly usage?: SessionUsageDocument;
};

/** Non-empty trimmed cwd, else undefined. */
const nonEmptyCwd = (cwd: string | undefined): string | undefined => {
  if (cwd === undefined) {
    return undefined;
  }
  const trimmed = cwd.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * ADR 0005 activate resolve: prefer snapshot cwd, else history cwd.
 * Absent entry / empty / whitespace count as missing.
 */
export const resolveSessionCwd = (
  snapshotCwd: string | undefined,
  historyCwd: string | undefined,
): string | undefined => nonEmptyCwd(snapshotCwd) ?? nonEmptyCwd(historyCwd);

/** Collects `cause.reasons[].defect` values from Die reasons. */
export const defectsFromCause = <E>(cause: Cause.Cause<E>): readonly unknown[] =>
  cause.reasons.flatMap(reason => (reason._tag === 'Die' ? [reason.defect] : []));

/** Collects `cause[].defect` from a wire-encoded Exit Failure cause array. */
export const defectsFromWireCause = (cause: unknown): readonly unknown[] => {
  if (!Array.isArray(cause)) {
    return [];
  }

  return cause.flatMap(reason => (isRecord(reason) && reason._tag === 'Die' ? [reason.defect] : []));
};

/**
 * Prefers the latest inbound Exit Failure's wire `cause[].defect` (keeps JSON-RPC
 * `data`), falling back to Effect Cause Die defects after Schema.Defect decode.
 */
export const defectsFromActivationFailure = <E>(
  rpcCalls: readonly RpcWireEntry[],
  cause: Cause.Cause<E>,
): readonly unknown[] => {
  for (let index = rpcCalls.length - 1; index >= 0; index -= 1) {
    const entry = rpcCalls[index];
    if (
      entry.direction === 'in' &&
      isRecord(entry.message) &&
      entry.message._tag === 'Exit' &&
      isRecord(entry.message.exit) &&
      entry.message.exit._tag === 'Failure'
    ) {
      const wireDefects = defectsFromWireCause(entry.message.exit.cause);
      if (wireDefects.length > 0) {
        return wireDefects;
      }
    }
  }

  return defectsFromCause(cause);
};

export type NormalizedSessionInfo = {
  readonly [key: string]: unknown;
  readonly cwd: string;
  readonly sessionId: string;
  readonly title?: string;
  readonly updatedAt?: string;
};

/** Cached `session/list` row; `unavailable` until its provider confirms it with a successful list. */
export type HistoryEntry = NormalizedSessionInfo & { readonly unavailable?: true };

export type UnifiedHistoryEntry = {
  readonly launchTarget: AgentLaunchTarget;
} & NormalizedSessionInfo;

export type BackendHarnessSnapshot = {
  /** Google OAuth URL captured from Antigravity BROWSER helper during Sign in. */
  readonly antigravityAuthUrl?: string;
  readonly failure?: HarnessFailure;
  readonly initializeResult?: unknown;
  readonly phase: AcpBootstrapPhase;
  readonly rpcCalls: readonly RpcWireEntry[];
  readonly sessionHistory: readonly HistoryEntry[];
  readonly sessions: Readonly<Record<string, SessionSnapshot>>;
};

export type NormalizedModel = {
  readonly description?: string;
  readonly id: string;
  readonly name: string;
};

export type NormalizedMode = {
  readonly description?: string;
  readonly id: string;
  readonly name: string;
};

export type NormalizedModels = {
  readonly currentId?: string;
  readonly options: readonly NormalizedModel[];
};

export type NormalizedModes = {
  readonly currentId?: string;
  readonly options: readonly NormalizedMode[];
};

export type NormalizedCapability = {
  readonly enabled: boolean;
  readonly path: string;
};

export type NormalizedAuthMethod = {
  readonly id: string;
  readonly name?: string;
};

export type NormalizedAgentInfo = {
  readonly name: string;
  readonly title?: string;
  readonly version: string;
};

export type NormalizedInitializeState = {
  readonly agentInfo?: NormalizedAgentInfo;
  readonly authMethods: readonly NormalizedAuthMethod[];
  readonly capabilities: readonly NormalizedCapability[];
  readonly metaExtensions: readonly { readonly key: string; readonly summary: string }[];
  readonly protocolVersion?: number;
};

export type NormalizedConfigChoice = {
  readonly description?: string;
  readonly id: string;
  readonly name: string;
};

type NormalizedConfigOptionBase = {
  readonly category?: string;
  readonly description?: string;
  readonly id: string;
  readonly name: string;
};

export type NormalizedSelectConfigOption = {
  readonly choices: readonly NormalizedConfigChoice[];
  readonly currentValue?: string;
  readonly type: 'select';
} & NormalizedConfigOptionBase;

export type NormalizedBooleanConfigOption = {
  readonly currentValue?: boolean;
  readonly type: 'boolean';
} & NormalizedConfigOptionBase;

export type NormalizedConfigOption = NormalizedBooleanConfigOption | NormalizedSelectConfigOption;

export type NormalizedSessionState = {
  readonly configOptions: readonly NormalizedConfigOption[];
  readonly models: NormalizedModels;
  readonly modes: NormalizedModes;
  readonly sessionId?: string;
};

export const initialBackendHarnessSnapshot = (): BackendHarnessSnapshot => ({
  phase: 'connecting',
  rpcCalls: [],
  sessionHistory: [],
  sessions: {},
});

export const initialSessionSnapshot = (sessionId: string, status: SessionStatus = 'inactive'): SessionSnapshot => ({
  sessionId,
  status,
  transcript: emptySessionTranscript(),
});

/** Temp-cwd prefix for Config probe sessions — never shown as history entries. */
export const CONFIG_PROBE_CWD_PREFIX = 'ao-config-probe-';

export const isConfigProbeCwd = (cwd: string): boolean => {
  const base = cwd.replaceAll('\\', '/').split('/').pop() ?? '';
  return base.startsWith(CONFIG_PROBE_CWD_PREFIX);
};

export const normalizeSessionInfo = (entry: unknown): NormalizedSessionInfo | undefined => {
  if (!isRecord(entry) || typeof entry.sessionId !== 'string' || typeof entry.cwd !== 'string') {
    return undefined;
  }
  if (isConfigProbeCwd(entry.cwd)) {
    return undefined;
  }

  return {
    ...entry,
    cwd: entry.cwd,
    sessionId: entry.sessionId,
    title: typeof entry.title === 'string' ? entry.title : undefined,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : undefined,
  };
};

export const normalizeSessionInfoFromNew = (result: unknown, cwd: string): NormalizedSessionInfo | undefined => {
  if (!isRecord(result) || typeof result.sessionId !== 'string') {
    return undefined;
  }

  return {
    ...result,
    cwd,
    sessionId: result.sessionId,
    title: typeof result.title === 'string' ? result.title : undefined,
    updatedAt: typeof result.updatedAt === 'string' ? result.updatedAt : new Date(Date.now()).toISOString(),
  };
};

export const upsertHistoryEntry = (
  history: readonly NormalizedSessionInfo[],
  entry: NormalizedSessionInfo,
): readonly NormalizedSessionInfo[] => [entry, ...history.filter(item => item.sessionId !== entry.sessionId)];

/** Apply `session_info_update.title` onto the matching history row (same field as `session/list`). */
export const applySessionInfoTitle = (
  history: readonly NormalizedSessionInfo[],
  sessionId: string,
  title: string,
): readonly NormalizedSessionInfo[] =>
  history.map(entry => (entry.sessionId === sessionId ? { ...entry, title } : entry));

export const normalizeSessionHistory = (listResult: unknown): readonly NormalizedSessionInfo[] => {
  if (!isRecord(listResult) || !Array.isArray(listResult.sessions)) {
    return [];
  }

  return listResult.sessions.flatMap(entry => {
    const normalized = normalizeSessionInfo(entry);
    return normalized === undefined ? [] : [normalized];
  });
};

/** Missing `updatedAt` sorts last (oldest). Equal timestamps tie-break by `sessionId`. */
export const compareHistoryEntriesByUpdatedAtDesc = (
  left: Pick<NormalizedSessionInfo, 'sessionId' | 'updatedAt'>,
  right: Pick<NormalizedSessionInfo, 'sessionId' | 'updatedAt'>,
): number => {
  const leftTime = left.updatedAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(left.updatedAt);
  const rightTime = right.updatedAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(right.updatedAt);
  const leftMs = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
  const rightMs = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;
  if (leftMs !== rightMs) {
    return rightMs - leftMs;
  }
  return left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0;
};

export const maxUpdatedAtMs = (sessions: readonly Pick<NormalizedSessionInfo, 'updatedAt'>[]): number => {
  let max = Number.NEGATIVE_INFINITY;
  for (const entry of sessions) {
    if (entry.updatedAt !== undefined) {
      const parsed = Date.parse(entry.updatedAt);
      if (Number.isFinite(parsed) && parsed > max) {
        max = parsed;
      }
    }
  }
  return max;
};

export const groupAndSortSessionsByCwd = <T extends NormalizedSessionInfo>(
  history: readonly T[],
): readonly { cwd: string; sessions: readonly T[] }[] => {
  const groups = new Map<string, T[]>();
  for (const entry of history) {
    const existing = groups.get(entry.cwd);
    if (existing === undefined) {
      groups.set(entry.cwd, [entry]);
    } else {
      existing.push(entry);
    }
  }

  return [...groups.entries()]
    .map(([cwd, sessions]) => ({
      cwd,
      sessions: [...sessions].sort(compareHistoryEntriesByUpdatedAtDesc),
    }))
    .sort((left, right) => {
      const leftMax = maxUpdatedAtMs(left.sessions);
      const rightMax = maxUpdatedAtMs(right.sessions);
      if (leftMax !== rightMax) {
        return rightMax - leftMax;
      }
      return left.cwd < right.cwd ? -1 : left.cwd > right.cwd ? 1 : 0;
    });
};

/** Same group/sort as the desktop history; keep only the group for `cwd` (empty if none). */
export const sessionsForCwd = <T extends NormalizedSessionInfo>(
  history: readonly T[],
  cwd: string | undefined,
): readonly T[] => {
  if (cwd === undefined) {
    return [];
  }
  return groupAndSortSessionsByCwd(history).find(group => group.cwd === cwd)?.sessions ?? [];
};

const parseModelOptions = (value: unknown): readonly NormalizedModel[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(entry => {
    if (!isRecord(entry)) {
      return [];
    }

    const modelId =
      typeof entry.modelId === 'string' ? entry.modelId : typeof entry.value === 'string' ? entry.value : undefined;
    const name = typeof entry.name === 'string' ? entry.name : modelId;
    if (modelId === undefined || name === undefined) {
      return [];
    }

    return [
      {
        description: typeof entry.description === 'string' ? entry.description : undefined,
        id: modelId,
        name,
      },
    ];
  });
};

const parseModeOptions = (value: unknown): readonly NormalizedMode[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(entry => {
    if (!isRecord(entry)) {
      return [];
    }

    const modeId = typeof entry.id === 'string' ? entry.id : typeof entry.value === 'string' ? entry.value : undefined;
    const name = typeof entry.name === 'string' ? entry.name : modeId;
    if (modeId === undefined || name === undefined) {
      return [];
    }

    return [
      {
        description: typeof entry.description === 'string' ? entry.description : undefined,
        id: modeId,
        name,
      },
    ];
  });
};

const findConfigOption = (sessionConfiguration: unknown, id: string): Record<string, unknown> | undefined => {
  if (!isRecord(sessionConfiguration) || !Array.isArray(sessionConfiguration.configOptions)) {
    return undefined;
  }

  return sessionConfiguration.configOptions.find(
    (option): option is Record<string, unknown> => isRecord(option) && option.id === id,
  );
};

/**
 * Response `configOptions` is the full id set for the current model — drop ids not in the
 * response; for present ids, fill `options` from previous when incoming omits `options`.
 */
const mergeConfigOptions = (existing: unknown, incoming: readonly unknown[]): readonly unknown[] => {
  if (!Array.isArray(existing) || existing.length === 0) {
    return incoming;
  }

  const existingOptions = existing.filter((option): option is Record<string, unknown> => isRecord(option));
  const existingById = new Map(
    existingOptions.flatMap(option => (typeof option.id === 'string' ? [[option.id, option] as const] : [])),
  );

  return incoming.flatMap(incomingOption => {
    if (!isRecord(incomingOption) || typeof incomingOption.id !== 'string') {
      return [incomingOption];
    }

    const previous = existingById.get(incomingOption.id);
    if (previous === undefined) {
      return [incomingOption];
    }

    return [
      {
        ...previous,
        ...incomingOption,
        options: Array.isArray(incomingOption.options) ? incomingOption.options : previous.options,
      },
    ];
  });
};

/** Reads model selection from session config options. */
export const normalizeModels = (sessionNew: unknown): NormalizedModels => {
  if (!isRecord(sessionNew)) {
    return { options: [] };
  }

  const modelOption = findConfigOption(sessionNew, 'model');
  if (modelOption === undefined) {
    return { options: [] };
  }

  return {
    currentId: typeof modelOption.currentValue === 'string' ? modelOption.currentValue : undefined,
    options: parseModelOptions(modelOption.options),
  };
};

/** Reads mode selection from session config options. */
export const normalizeModes = (sessionNew: unknown): NormalizedModes => {
  if (!isRecord(sessionNew)) {
    return { options: [] };
  }

  const modeOption = findConfigOption(sessionNew, 'mode');
  if (modeOption === undefined) {
    return { options: [] };
  }

  return {
    currentId: typeof modeOption.currentValue === 'string' ? modeOption.currentValue : undefined,
    options: parseModeOptions(modeOption.options),
  };
};

export const selectionFromSessionConfiguration = (
  result: unknown,
): {
  readonly selectedModeId?: string;
  readonly selectedModelId?: string;
} => {
  const models = normalizeModels(result);
  const modes = normalizeModes(result);
  return {
    selectedModeId: modes.currentId,
    selectedModelId: models.currentId,
  };
};

export const applySetConfigOptionResult = (
  sessionConfiguration: unknown,
  result: unknown,
): {
  readonly selectedModeId?: string;
  readonly selectedModelId?: string;
  readonly sessionConfiguration: unknown;
} => {
  const base: Record<string, unknown> = isRecord(sessionConfiguration) ? { ...sessionConfiguration } : {};

  if (isRecord(result) && Array.isArray(result.configOptions)) {
    base.configOptions = mergeConfigOptions(base.configOptions, result.configOptions);
  }

  const selection = selectionFromSessionConfiguration(base);
  return {
    selectedModeId: selection.selectedModeId,
    selectedModelId: selection.selectedModelId,
    sessionConfiguration: base,
  };
};

const flattenCapabilities = (value: unknown, prefix = ''): readonly NormalizedCapability[] => {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix.length > 0 ? `${prefix}.${key}` : key;

    if (typeof entry === 'boolean') {
      return [{ enabled: entry, path }];
    }

    if (isRecord(entry)) {
      if (Object.keys(entry).length === 0) {
        return [{ enabled: true, path }];
      }

      return flattenCapabilities(entry, path);
    }

    return [];
  });
};

const summarizeMetaValue = (value: unknown): string => {
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => (typeof item === 'string' ? item : JSON.stringify(item))).join(', ');
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return 'enabled';
    }

    return entries.map(([key, item]) => `${key}: ${summarizeMetaValue(item)}`).join(' · ');
  }

  return '—';
};

const parseAuthMethods = (value: unknown): readonly NormalizedAuthMethod[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(entry => {
    if (!isRecord(entry)) {
      return [];
    }

    const id =
      typeof entry.id === 'string' ? entry.id : typeof entry.methodId === 'string' ? entry.methodId : undefined;
    if (id === undefined) {
      return [];
    }

    return [
      {
        id,
        name: typeof entry.name === 'string' ? entry.name : undefined,
      },
    ];
  });
};

const parseConfigChoices = (value: unknown): readonly NormalizedConfigChoice[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(entry => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = typeof entry.value === 'string' ? entry.value : typeof entry.id === 'string' ? entry.id : undefined;
    const name = typeof entry.name === 'string' ? entry.name : id;
    if (id === undefined || name === undefined) {
      return [];
    }

    return [
      {
        id,
        name,
        ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      },
    ];
  });
};

export const normalizeInitialize = (initializeResult: unknown): NormalizedInitializeState | undefined => {
  if (!isRecord(initializeResult)) {
    return undefined;
  }

  const agentInfo = isRecord(initializeResult.agentInfo)
    ? (() => {
        const name = typeof initializeResult.agentInfo.name === 'string' ? initializeResult.agentInfo.name : undefined;
        const version =
          typeof initializeResult.agentInfo.version === 'string' ? initializeResult.agentInfo.version : undefined;
        if (name === undefined || version === undefined) {
          return undefined;
        }

        return {
          name,
          title: typeof initializeResult.agentInfo.title === 'string' ? initializeResult.agentInfo.title : undefined,
          version,
        };
      })()
    : undefined;

  const metaExtensions = isRecord(initializeResult._meta)
    ? Object.entries(initializeResult._meta).map(([key, value]) => ({
        key,
        summary: summarizeMetaValue(value),
      }))
    : [];

  return {
    agentInfo,
    authMethods: parseAuthMethods(initializeResult.authMethods),
    capabilities: flattenCapabilities(initializeResult.agentCapabilities),
    metaExtensions,
    protocolVersion:
      typeof initializeResult.protocolVersion === 'number' ? initializeResult.protocolVersion : undefined,
  };
};

/** True when initialize lists AIR `sessionArchive` (served with `sessionIndex`). */
export const hasSessionArchiveCapability = (initializeResult: unknown): boolean => {
  if (!isRecord(initializeResult) || !isRecord(initializeResult._meta)) {
    return false;
  }
  const { jetbrains } = initializeResult._meta;
  if (!isRecord(jetbrains) || !isRecord(jetbrains.air)) {
    return false;
  }
  const { capabilities } = jetbrains.air;
  return Array.isArray(capabilities) && capabilities.includes(airCapability.sessionArchive);
};

/** True when initialize advertises `sessionCapabilities.fork` (`{}`). */
export const hasSessionForkCapability = (initializeResult: unknown): boolean => {
  const normalized = normalizeInitialize(initializeResult);
  return (
    normalized?.capabilities.some(
      capability => capability.path === 'sessionCapabilities.fork' && capability.enabled,
    ) === true
  );
};

/** True when initialize advertises `sessionCapabilities.close` (`{}`). */
export const hasSessionCloseCapability = (initializeResult: unknown): boolean => {
  const normalized = normalizeInitialize(initializeResult);
  return (
    normalized?.capabilities.some(
      capability => capability.path === 'sessionCapabilities.close' && capability.enabled,
    ) === true
  );
};

export const normalizeConfigOptions = (sessionNew: unknown): readonly NormalizedConfigOption[] => {
  if (!isRecord(sessionNew) || !Array.isArray(sessionNew.configOptions)) {
    return [];
  }

  return sessionNew.configOptions.flatMap((entry): readonly NormalizedConfigOption[] => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      return [];
    }

    const base = {
      category: typeof entry.category === 'string' ? entry.category : undefined,
      description: typeof entry.description === 'string' ? entry.description : undefined,
      id: entry.id,
      name: entry.name,
    };

    if (entry.type === 'boolean') {
      return [
        {
          ...base,
          currentValue: typeof entry.currentValue === 'boolean' ? entry.currentValue : undefined,
          type: 'boolean',
        },
      ];
    }

    if (entry.type === 'select') {
      return [
        {
          ...base,
          choices: parseConfigChoices(entry.options),
          currentValue: typeof entry.currentValue === 'string' ? entry.currentValue : undefined,
          type: 'select',
        },
      ];
    }

    return [];
  });
};

export const normalizeSelectableConfigOptions = (
  sessionConfiguration: unknown,
): readonly NormalizedSelectConfigOption[] =>
  normalizeConfigOptions(sessionConfiguration).flatMap(option =>
    option.type === 'select' && option.choices.length > 0 ? [option] : [],
  );

export const patchConfigOptionValue = (
  sessionConfiguration: unknown,
  configId: string,
  value: boolean | string,
): unknown => {
  if (!isRecord(sessionConfiguration) || !Array.isArray(sessionConfiguration.configOptions)) {
    return sessionConfiguration;
  }

  const configOptions: readonly unknown[] = sessionConfiguration.configOptions;
  return {
    ...sessionConfiguration,
    configOptions: configOptions.map(option =>
      isRecord(option) && option.id === configId ? { ...option, currentValue: value } : option,
    ),
  };
};

export const normalizeSession = (sessionNew: unknown): NormalizedSessionState | undefined => {
  if (!isRecord(sessionNew)) {
    return undefined;
  }

  return {
    configOptions: normalizeConfigOptions(sessionNew),
    models: normalizeModels(sessionNew),
    modes: normalizeModes(sessionNew),
    sessionId: typeof sessionNew.sessionId === 'string' ? sessionNew.sessionId : undefined,
  };
};
