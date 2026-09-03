/** Bootstrap phase model and normalizers for ACP session startup. */

import { isRecord } from '../../utils.ts';

import type { AcpAgentBackend, RpcWireEntry } from './agentHarness.ts';
import type { AvailableCommand, ChatItem, SessionUsage } from './sessionUpdateReducer.ts';

export type AcpBootstrapPhase = 'connecting' | 'error' | 'initialized' | 'ready';

export type SessionStatus = 'activating' | 'active' | 'inactive';

export type SessionSnapshot = {
  readonly availableCommands?: readonly AvailableCommand[];
  readonly chatItems: readonly ChatItem[];
  readonly pendingClientRequest?: boolean;
  readonly selectedModeId?: string;
  readonly selectedModelId?: string;
  readonly sessionId: string;
  readonly sessionState?: unknown;
  readonly status: SessionStatus;
  readonly usage?: SessionUsage;
};

export type NormalizedSessionInfo = {
  readonly cwd: string;
  readonly sessionId: string;
  readonly title?: string;
  readonly updatedAt?: string;
};

export type BackendSnapshot = {
  readonly error?: string;
  readonly initializeResult?: unknown;
  readonly phase: AcpBootstrapPhase;
  readonly rpcCalls: readonly RpcWireEntry[];
  readonly selectedSessionId?: string;
  readonly sessionRoster: readonly NormalizedSessionInfo[];
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

export type NormalizedConfigOption = {
  readonly category?: string;
  readonly choices: readonly NormalizedConfigChoice[];
  readonly currentValue?: string;
  readonly description?: string;
  readonly id: string;
  readonly name: string;
  readonly type?: string;
};

export type NormalizedSessionState = {
  readonly configOptions: readonly NormalizedConfigOption[];
  readonly models: NormalizedModels;
  readonly modes: NormalizedModes;
  readonly sessionId?: string;
};

export const ALL_ACP_BACKENDS = [
  'echo',
  'codex-acp',
  'claude-agent-acp',
  // 'gemini-cli',
] as const satisfies readonly AcpAgentBackend[];

export const backendLabel = (backend: AcpAgentBackend): string => {
  switch (backend) {
    case 'claude-agent-acp':
      return 'Claude';
    case 'codex-acp':
      return 'Codex';
    case 'echo':
      return 'Echo (jsonrpc-echo)';
    case 'gemini-cli':
      return 'Gemini';
  }
};

export const initialBackendSnapshot = (): BackendSnapshot => ({
  phase: 'connecting',
  rpcCalls: [],
  sessionRoster: [],
  sessions: {},
});

export const initialSessionSnapshot = (sessionId: string, status: SessionStatus = 'inactive'): SessionSnapshot => ({
  chatItems: [],
  sessionId,
  status,
});

export const normalizeSessionInfo = (entry: unknown): NormalizedSessionInfo | undefined => {
  if (!isRecord(entry) || typeof entry.sessionId !== 'string' || typeof entry.cwd !== 'string') {
    return undefined;
  }

  return {
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
    cwd,
    sessionId: result.sessionId,
    title: typeof result.title === 'string' ? result.title : undefined,
    updatedAt: typeof result.updatedAt === 'string' ? result.updatedAt : undefined,
  };
};

export const upsertRosterEntry = (
  roster: readonly NormalizedSessionInfo[],
  entry: NormalizedSessionInfo,
): readonly NormalizedSessionInfo[] => [entry, ...roster.filter(item => item.sessionId !== entry.sessionId)];

export const normalizeSessionRoster = (listResult: unknown): readonly NormalizedSessionInfo[] => {
  if (!isRecord(listResult) || !Array.isArray(listResult.sessions)) {
    return [];
  }

  return listResult.sessions.flatMap(entry => {
    const normalized = normalizeSessionInfo(entry);
    return normalized === undefined ? [] : [normalized];
  });
};

export const selectedSessionSnapshot = (snapshot: BackendSnapshot): SessionSnapshot | undefined => {
  if (snapshot.selectedSessionId === undefined) {
    return undefined;
  }

  return snapshot.sessions[snapshot.selectedSessionId];
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

const findConfigOption = (sessionState: unknown, id: string): Record<string, unknown> | undefined => {
  if (!isRecord(sessionState) || !Array.isArray(sessionState.configOptions)) {
    return undefined;
  }

  return sessionState.configOptions.find(
    (option): option is Record<string, unknown> => isRecord(option) && option.id === id,
  );
};

/** Partial set_config_option responses often omit `options`; keep prior choices by id. */
const mergeConfigOptions = (existing: unknown, incoming: readonly unknown[]): readonly unknown[] => {
  if (!Array.isArray(existing) || existing.length === 0) {
    return incoming;
  }

  const existingOptions = existing.filter((option): option is Record<string, unknown> => isRecord(option));
  const existingById = new Map(
    existingOptions.flatMap(option => (typeof option.id === 'string' ? [[option.id, option] as const] : [])),
  );

  const mergedIds = new Set<string>();

  const merged = incoming.flatMap(incomingOption => {
    if (!isRecord(incomingOption) || typeof incomingOption.id !== 'string') {
      return [incomingOption];
    }

    mergedIds.add(incomingOption.id);
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

  const untouched = existingOptions.filter(option => typeof option.id === 'string' && !mergedIds.has(option.id));

  return [...merged, ...untouched];
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
  sessionState: unknown,
  result: unknown,
): {
  readonly selectedModeId?: string;
  readonly selectedModelId?: string;
  readonly sessionState: unknown;
} => {
  const base: Record<string, unknown> = isRecord(sessionState) ? { ...sessionState } : {};

  if (isRecord(result) && Array.isArray(result.configOptions)) {
    base.configOptions = mergeConfigOptions(base.configOptions, result.configOptions);
  }

  const selection = selectionFromSessionConfiguration(base);
  return {
    selectedModeId: selection.selectedModeId,
    selectedModelId: selection.selectedModelId,
    sessionState: base,
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
        description: typeof entry.description === 'string' ? entry.description : undefined,
        id,
        name,
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

  return sessionNew.configOptions.flatMap(entry => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      return [];
    }

    return [
      {
        category: typeof entry.category === 'string' ? entry.category : undefined,
        choices: parseConfigChoices(entry.options),
        currentValue: typeof entry.currentValue === 'string' ? entry.currentValue : undefined,
        description: typeof entry.description === 'string' ? entry.description : undefined,
        id: entry.id,
        name: entry.name,
        type: typeof entry.type === 'string' ? entry.type : undefined,
      },
    ];
  });
};

export const normalizeSelectableConfigOptions = (sessionState: unknown): readonly NormalizedConfigOption[] =>
  normalizeConfigOptions(sessionState).filter(option => option.type === 'select' && option.choices.length > 0);

export const patchConfigOptionValue = (sessionState: unknown, configId: string, value: string): unknown => {
  if (!isRecord(sessionState) || !Array.isArray(sessionState.configOptions)) {
    return sessionState;
  }

  const configOptions: readonly unknown[] = sessionState.configOptions;
  return {
    ...sessionState,
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
