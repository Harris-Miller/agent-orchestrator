import type { InitializeResponse } from '@libs/effect-acp';

import { ADAPTER_AGENT_INFO } from './adapterAgentInfo.ts';

export type AdapterAgentInfo = {
  readonly name: string;
  readonly title: string;
  readonly version: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Overlay Client-facing session lifecycle caps; replace agentInfo; pass through auth and Gemini prompt/mcp/loadSession.
 */
export const rewriteInitializeResponse = (
  geminiResult: InitializeResponse,
  agentInfo: AdapterAgentInfo = ADAPTER_AGENT_INFO,
): InitializeResponse => {
  const caps = isPlainObject(geminiResult.agentCapabilities) ? { ...geminiResult.agentCapabilities } : {};
  const sessionCapabilities = isPlainObject(caps.sessionCapabilities) ? { ...caps.sessionCapabilities } : {};

  return {
    _meta: geminiResult._meta,
    agentCapabilities: {
      ...caps,
      sessionCapabilities: {
        ...sessionCapabilities,
        close: {},
        delete: {},
        list: {},
        resume: {},
      },
    },
    agentInfo,
    authMethods: geminiResult.authMethods,
    protocolVersion: geminiResult.protocolVersion,
  };
};
