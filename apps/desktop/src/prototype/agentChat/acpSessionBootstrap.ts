/** Bootstrap phase model and normalizers for ACP session startup. */

import type { AcpAgentBackend, RpcWireEntry } from './agentHarness.ts';
import type { AvailableCommand, ChatItem } from './sessionUpdateReducer.ts';

export type AcpBootstrapPhase = 'connecting' | 'error' | 'initialized' | 'ready' | 'session_open';

export type BackendSnapshot = {
  readonly availableCommands?: readonly AvailableCommand[];
  readonly chatItems: readonly ChatItem[];
  readonly error?: string;
  readonly initializeResult?: unknown;
  readonly phase: AcpBootstrapPhase;
  readonly rpcCalls: readonly RpcWireEntry[];
  readonly selectedModeId?: string;
  readonly selectedModelId?: string;
  readonly sessionId?: string;
  readonly sessionNewResult?: unknown;
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

export const ALL_ACP_BACKENDS = ['echo', 'codex-acp', 'claude-agent-acp'] as const satisfies readonly AcpAgentBackend[];

export const backendLabel = (backend: AcpAgentBackend): string => {
  switch (backend) {
    case 'claude-agent-acp':
      return 'Claude';
    case 'codex-acp':
      return 'Codex';
    case 'echo':
      return 'Echo (jsonrpc-echo)';
  }
};

export const initialBackendSnapshot = (): BackendSnapshot => ({
  chatItems: [],
  phase: 'connecting',
  rpcCalls: [],
});

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      return [];
    }

    return [
      {
        description: typeof entry.description === 'string' ? entry.description : undefined,
        id: entry.id,
        name: entry.name,
      },
    ];
  });
};

/** Codex exposes top-level `models`; Claude uses `configOptions` where `id === 'model'`. */
export const normalizeModels = (sessionNew: unknown): NormalizedModels => {
  if (!isRecord(sessionNew)) {
    return { options: [] };
  }

  if (isRecord(sessionNew.models)) {
    const { models } = sessionNew;
    return {
      currentId: typeof models.currentModelId === 'string' ? models.currentModelId : undefined,
      options: parseModelOptions(models.availableModels),
    };
  }

  if (Array.isArray(sessionNew.configOptions)) {
    const modelOption = sessionNew.configOptions.find(
      (option): option is Record<string, unknown> => isRecord(option) && option.id === 'model',
    );
    if (modelOption !== undefined) {
      return {
        currentId: typeof modelOption.currentValue === 'string' ? modelOption.currentValue : undefined,
        options: parseModelOptions(modelOption.options),
      };
    }
  }

  return { options: [] };
};

export const normalizeModes = (sessionNew: unknown): NormalizedModes => {
  if (!isRecord(sessionNew) || !isRecord(sessionNew.modes)) {
    return { options: [] };
  }

  const { modes } = sessionNew;
  return {
    currentId: typeof modes.currentModeId === 'string' ? modes.currentModeId : undefined,
    options: parseModeOptions(modes.availableModes),
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
