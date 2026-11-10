/** Bootstrap phase model and normalizers for ACP session startup. */

import type { SessionUsage } from './sessionUsage.ts';
import type { Cause } from 'effect';

import { isRecord } from '../isRecord.ts';

import { NO_AGENT_CAPABILITIES } from './agentCapabilities.ts';
import { isArchivedEntry } from './airMeta.ts';
import type { AgentCapabilities } from './agentCapabilities.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import type { HarnessFailure } from './harnessFailure.ts';
import type { RpcWireEntry } from './backendHarness.ts';
import type { PendingElicitation, PendingPermission } from './pendingInteractions.ts';
import type { AvailableCommand, SessionTranscript } from './sessionUpdateReducer.ts';
import { emptySessionTranscript } from './sessionUpdateReducer.ts';
import type { SubagentRecord } from './subagent.ts';

export type AcpBootstrapPhase = 'connecting' | 'error' | 'initialized' | 'ready' | 'signing-in' | 'usable';

/** `usable`: initialize (and Sign in) done and a Config option index exists (cached or probe-seeded), so session RPCs work. `ready`: session list published too. */
export const isUsablePhase = (phase: AcpBootstrapPhase): boolean => phase === 'usable' || phase === 'ready';

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
  /** Session configuration (glossary): the agent's last-reported Config options. Absent until reported. */
  readonly configuration?: SessionConfiguration;
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly transcript: SessionTranscript;
  readonly usage?: SessionUsage;
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
  rpcWireLog: readonly RpcWireEntry[],
  cause: Cause.Cause<E>,
): readonly unknown[] => {
  for (let index = rpcWireLog.length - 1; index >= 0; index -= 1) {
    const entry = rpcWireLog[index];
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
  /** What the Harness may use on this Backend connection; read once from the initialize result. */
  readonly agentCapabilities: AgentCapabilities;
  /** Google OAuth URL captured from Antigravity BROWSER helper during Sign in. */
  readonly antigravityAuthUrl?: string;
  readonly failure?: HarnessFailure;
  /** Raw initialize response, Developer panel only; Harness decisions read `agentCapabilities`. */
  readonly initializeResult?: unknown;
  readonly phase: AcpBootstrapPhase;
  readonly sessionHistory: readonly HistoryEntry[];
  readonly sessions: Readonly<Record<string, SessionSnapshot>>;
  /** Subagent child sessions keyed by child id; never top-level sessions (no history, activation, prompts, usage). */
  readonly subagents: SubagentRecord;
};

export type NormalizedModel = {
  readonly description?: string;
  readonly id: string;
  readonly name: string;
};

export type NormalizedModels = {
  readonly currentId?: string;
  readonly options: readonly NormalizedModel[];
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

/** Session configuration (glossary): one Session's Config options as the agent last reported them. */
export type SessionConfiguration = readonly NormalizedConfigOption[];

export const initialBackendHarnessSnapshot = (): BackendHarnessSnapshot => ({
  agentCapabilities: NO_AGENT_CAPABILITIES,
  phase: 'connecting',
  sessionHistory: [],
  sessions: {},
  subagents: {},
});

export const initialSessionSnapshot = (sessionId: string, status: SessionStatus = 'inactive'): SessionSnapshot => ({
  sessionId,
  status,
  transcript: emptySessionTranscript(),
});

/** Temp-cwd prefix for Config probe sessions — never shown as history entries. */
export const CONFIG_PROBE_CWD_PREFIX = 'hoa-config-probe-';

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
  title: string | undefined,
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

/** Session History order: unarchived rows before archived ones, each newest `updatedAt` first. */
export const compareHistoryEntries = (left: NormalizedSessionInfo, right: NormalizedSessionInfo): number =>
  Number(isArchivedEntry(left)) - Number(isArchivedEntry(right)) || compareHistoryEntriesByUpdatedAtDesc(left, right);

/** History entries for `cwd` in Session History order (empty when `cwd` is undefined). */
export const sessionsForCwd = <T extends NormalizedSessionInfo>(
  history: readonly T[],
  cwd: string | undefined,
): readonly T[] => (cwd === undefined ? [] : history.filter(entry => entry.cwd === cwd).sort(compareHistoryEntries));

/** VS Code Recent sessions: the newest `limit` unarchived entries for `cwd`, whatever Show archived says. */
export const recentSessionsForCwd = <T extends NormalizedSessionInfo>(
  history: readonly T[],
  cwd: string | undefined,
  limit: number,
): readonly T[] =>
  sessionsForCwd(
    history.filter(entry => !isArchivedEntry(entry)),
    cwd,
  ).slice(0, limit);

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

const findConfigOption = (response: unknown, id: string): Record<string, unknown> | undefined => {
  if (!isRecord(response) || !Array.isArray(response.configOptions)) {
    return undefined;
  }

  return response.configOptions.find(
    (option): option is Record<string, unknown> => isRecord(option) && option.id === id,
  );
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
