import { assert, describe, it } from '@effect/vitest';

import { ADAPTER_AGENT_INFO } from './adapterAgentInfo.ts';
import { rewriteInitializeResponse } from './rewriteInitialize.ts';

describe('rewriteInitializeResponse', () => {
  it('overlays list/close/delete/resume and replaces agentInfo', () => {
    const rewritten = rewriteInitializeResponse({
      agentCapabilities: {
        loadSession: true,
        mcpCapabilities: { http: true },
        promptCapabilities: { audio: true, embeddedContext: true, image: true },
      },
      agentInfo: { name: 'gemini-cli', title: 'Gemini CLI', version: '1.2.3' },
      authMethods: [{ id: 'google', name: 'Google' }],
      protocolVersion: 1,
    });

    assert.deepStrictEqual(rewritten.agentInfo, ADAPTER_AGENT_INFO);
    assert.deepStrictEqual(rewritten.authMethods, [{ id: 'google', name: 'Google' }]);
    assert.strictEqual(rewritten.protocolVersion, 1);

    const caps = rewritten.agentCapabilities as Record<string, unknown>;
    assert.strictEqual(caps.loadSession, true);
    assert.deepStrictEqual(caps.mcpCapabilities, { http: true });
    assert.deepStrictEqual(caps.promptCapabilities, {
      audio: true,
      embeddedContext: true,
      image: true,
    });
    assert.deepStrictEqual(caps.sessionCapabilities, {
      close: {},
      delete: {},
      list: {},
      resume: {},
    });
  });

  it('preserves existing sessionCapabilities keys and does not add forbidden ones', () => {
    const rewritten = rewriteInitializeResponse({
      agentCapabilities: {
        sessionCapabilities: {
          close: { already: true },
          customVendorKey: {},
        },
      },
      protocolVersion: 1,
    });

    const sessionCapabilities = (rewritten.agentCapabilities as Record<string, unknown>).sessionCapabilities as Record<
      string,
      unknown
    >;
    assert.deepStrictEqual(sessionCapabilities.customVendorKey, {});
    assert.deepStrictEqual(sessionCapabilities.close, {});
    assert.deepStrictEqual(sessionCapabilities.delete, {});
    assert.deepStrictEqual(sessionCapabilities.list, {});
    assert.deepStrictEqual(sessionCapabilities.resume, {});
    assert.strictEqual('fork' in sessionCapabilities, false);
    assert.strictEqual('additionalDirectories' in sessionCapabilities, false);
    assert.strictEqual('subagents' in sessionCapabilities, false);
  });
});
