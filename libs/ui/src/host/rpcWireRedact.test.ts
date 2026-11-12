import { assert, describe, it } from '@effect/vitest';

import { REDACTED, redactRpcWireMessage } from './rpcWireRedact.ts';

describe('redactRpcWireMessage', () => {
  it('masks MCP server header and env values but keeps names and urls', () => {
    const redacted = redactRpcWireMessage({
      _tag: 'Request',
      payload: {
        cwd: '/w',
        mcpServers: [
          {
            headers: [{ name: 'Authorization', value: 'Bearer secret' }],
            name: 'hoa-hub',
            type: 'http',
            url: 'http://x',
          },
          { args: [], command: '/bin/x', env: [{ name: 'KEY', value: 'secret' }], name: 'stdio' },
        ],
      },
      tag: 'session/new',
    });
    assert.deepStrictEqual(redacted, {
      _tag: 'Request',
      payload: {
        cwd: '/w',
        mcpServers: [
          { headers: [{ name: 'Authorization', value: REDACTED }], name: 'hoa-hub', type: 'http', url: 'http://x' },
          { args: [], command: '/bin/x', env: [{ name: 'KEY', value: REDACTED }], name: 'stdio' },
        ],
      },
      tag: 'session/new',
    });
  });

  it('leaves messages without MCP servers alone', () => {
    const message = { _tag: 'Request', payload: { sessionId: 's' }, tag: 'session/prompt' };
    assert.strictEqual(redactRpcWireMessage(message), message);
  });
});
