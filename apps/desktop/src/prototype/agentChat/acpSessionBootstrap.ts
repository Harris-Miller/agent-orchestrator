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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

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
