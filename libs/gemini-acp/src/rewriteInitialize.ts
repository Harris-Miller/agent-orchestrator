import type { InitializeResponse } from '@libs/effect-acp';

import { ADAPTER_AGENT_INFO } from './adapterAgentInfo.ts';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Overlay Client-facing session lifecycle caps; replace agentInfo; pass through auth and Gemini prompt/mcp/loadSession.
 */
export const rewriteInitializeResponse = (geminiResult: InitializeResponse): InitializeResponse => {
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
    agentInfo: ADAPTER_AGENT_INFO,
    authMethods: geminiResult.authMethods,
    protocolVersion: geminiResult.protocolVersion,
  };
};
