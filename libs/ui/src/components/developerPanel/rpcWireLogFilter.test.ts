import { assert, describe, it } from '@effect/vitest';

import type { RpcWireEntry } from '../../host/backendHarness.ts';

import {
  cascadedWireIds,
  classifyRpcWireLog,
  coerceWireIdFilter,
  filterClassifiedRpcWireEntries,
  resolveSessionFilter,
  RPC_WIRE_FILTER_ACTIVE_SESSION,
  RPC_WIRE_FILTER_ALL,
} from './rpcWireLogFilter.ts';

const entry = (direction: 'in' | 'out', message: unknown, id = crypto.randomUUID()): RpcWireEntry => ({
  direction,
  id,
  message,
});

describe('classifyRpcWireLog', () => {
  it('marks initialize request as system', () => {
    const { classified } = classifyRpcWireLog([
      entry('out', {
        _tag: 'Request',
        id: 1,
        payload: { protocolVersion: 1 },
        tag: 'initialize',
      }),
    ]);
    assert.strictEqual(classified[0]?.facet.sessionKey, 'system');
    assert.strictEqual(classified[0]?.facet.tag, 'initialize');
    assert.strictEqual(classified[0]?.facet.wireId, '1');
    assert.strictEqual(classified[0]?.facet.title, '→ initialize');
  });

  it('uses payload.sessionId for session/prompt', () => {
    const { classified } = classifyRpcWireLog([
      entry('out', {
        _tag: 'Request',
        id: 2,
        payload: { prompt: [], sessionId: 'sess-a' },
        tag: 'session/prompt',
      }),
    ]);
    assert.strictEqual(classified[0]?.facet.sessionKey, 'sess-a');
    assert.strictEqual(classified[0]?.facet.tag, 'session/prompt');
  });

  it('composes session/update subtype into tag', () => {
    const { classified } = classifyRpcWireLog([
      entry('in', {
        _tag: 'Request',
        id: '',
        isNotification: true,
        payload: {
          sessionId: 'sess-a',
          update: { sessionUpdate: 'agent_message_chunk' },
        },
        tag: 'session/update',
      }),
    ]);
    assert.strictEqual(classified[0]?.facet.tag, 'session/update agent_message_chunk');
    assert.strictEqual(classified[0]?.facet.wireId, '');
    assert.strictEqual(classified[0]?.facet.sessionKey, 'sess-a');
    assert.strictEqual(classified[0]?.facet.title, '← session/update agent_message_chunk');
  });

  it('inherits tag and session on Exit / Chunk / Defect via requestId', () => {
    const { classified } = classifyRpcWireLog([
      entry('out', {
        _tag: 'Request',
        id: 3,
        payload: { prompt: [], sessionId: 'sess-b' },
        tag: 'session/prompt',
      }),
      entry('in', {
        _tag: 'Chunk',
        requestId: 3,
      }),
      entry('in', {
        _tag: 'Exit',
        exit: { _tag: 'Success', value: { stopReason: 'end_turn' } },
        requestId: 3,
      }),
      entry('in', {
        _tag: 'Defect',
        requestId: 3,
      }),
    ]);
    assert.strictEqual(classified[1]?.facet.tag, 'session/prompt');
    assert.strictEqual(classified[1]?.facet.sessionKey, 'sess-b');
    assert.strictEqual(classified[1]?.facet.wireId, '3');
    assert.strictEqual(classified[1]?.facet.title, '← session/prompt');
    assert.strictEqual(classified[2]?.facet.tag, 'session/prompt');
    assert.strictEqual(classified[2]?.facet.sessionKey, 'sess-b');
    assert.strictEqual(classified[3]?.facet.tag, 'session/prompt');
    assert.strictEqual(classified[3]?.facet.sessionKey, 'sess-b');
  });

  it('backfills session/new request from Exit success sessionId', () => {
    const { classified } = classifyRpcWireLog([
      entry('out', {
        _tag: 'Request',
        id: 4,
        payload: { cwd: '/tmp', mcpServers: [] },
        tag: 'session/new',
      }),
      entry('in', {
        _tag: 'Exit',
        exit: { _tag: 'Success', value: { sessionId: 'sess-new' } },
        requestId: 4,
      }),
    ]);
    assert.strictEqual(classified[0]?.facet.sessionKey, 'sess-new');
    assert.strictEqual(classified[0]?.facet.tag, 'session/new');
    assert.strictEqual(classified[1]?.facet.sessionKey, 'sess-new');
    assert.strictEqual(classified[1]?.facet.tag, 'session/new');
    assert.strictEqual(classified[1]?.facet.title, '← session/new');
  });

  it('collects distinct session and tag options from the full log', () => {
    const { sessionKeys, tags } = classifyRpcWireLog([
      entry('out', { _tag: 'Request', id: 1, payload: {}, tag: 'initialize' }),
      entry('out', {
        _tag: 'Request',
        id: 2,
        payload: { prompt: [], sessionId: 'sess-a' },
        tag: 'session/prompt',
      }),
      entry('in', {
        _tag: 'Request',
        id: '',
        payload: { sessionId: 'sess-a', update: { sessionUpdate: 'plan' } },
        tag: 'session/update',
      }),
    ]);
    assert.deepStrictEqual(sessionKeys, ['system', 'sess-a']);
    assert.deepStrictEqual(tags, ['initialize', 'session/prompt', 'session/update plan']);
  });
});

describe('filterClassifiedRpcWireEntries', () => {
  const { classified } = classifyRpcWireLog([
    entry('out', { _tag: 'Request', id: 1, payload: {}, tag: 'initialize' }),
    entry('out', {
      _tag: 'Request',
      id: 2,
      payload: { prompt: [], sessionId: 'sess-a' },
      tag: 'session/prompt',
    }),
    entry('in', {
      _tag: 'Exit',
      exit: { _tag: 'Success', value: { stopReason: 'end_turn' } },
      requestId: 2,
    }),
    entry('in', {
      _tag: 'Request',
      id: '',
      payload: { sessionId: 'sess-a', update: { sessionUpdate: 'plan' } },
      tag: 'session/update',
    }),
  ]);

  it('ANDs session + tag + wireId filters', () => {
    const filtered = filterClassifiedRpcWireEntries(classified, {
      sessionKey: 'sess-a',
      tag: 'session/prompt',
      wireId: '2',
    });
    assert.strictEqual(filtered.length, 2);
    assert.ok(filtered.every(row => row.facet.wireId === '2'));
  });

  it('All leaves a dimension unconstrained', () => {
    const filtered = filterClassifiedRpcWireEntries(classified, {
      sessionKey: 'sess-a',
      tag: RPC_WIRE_FILTER_ALL,
      wireId: RPC_WIRE_FILTER_ALL,
    });
    assert.strictEqual(filtered.length, 3);
  });
});

describe('cascadedWireIds / coerceWireIdFilter', () => {
  const { classified } = classifyRpcWireLog([
    entry('out', { _tag: 'Request', id: 1, payload: {}, tag: 'initialize' }),
    entry('out', {
      _tag: 'Request',
      id: 2,
      payload: { prompt: [], sessionId: 'sess-a' },
      tag: 'session/prompt',
    }),
    entry('in', {
      _tag: 'Request',
      id: '',
      payload: { sessionId: 'sess-a', update: { sessionUpdate: 'plan' } },
      tag: 'session/update',
    }),
  ]);

  it('cascades id options from session (+ tag) slice', () => {
    assert.deepStrictEqual(cascadedWireIds(classified, { sessionKey: 'sess-a', tag: RPC_WIRE_FILTER_ALL }), ['2', '']);
    assert.deepStrictEqual(cascadedWireIds(classified, { sessionKey: 'sess-a', tag: 'session/prompt' }), ['2']);
  });

  it('resets stale wireId to All when missing from cascaded options', () => {
    assert.strictEqual(coerceWireIdFilter('1', ['2', '']), RPC_WIRE_FILTER_ALL);
    assert.strictEqual(coerceWireIdFilter('2', ['2', '']), '2');
    assert.strictEqual(coerceWireIdFilter('', ['2', '']), '');
    assert.strictEqual(coerceWireIdFilter(RPC_WIRE_FILTER_ALL, ['2']), RPC_WIRE_FILTER_ALL);
  });
});

describe('resolveSessionFilter', () => {
  it('passes through concrete session and All', () => {
    assert.strictEqual(resolveSessionFilter(RPC_WIRE_FILTER_ALL, undefined), RPC_WIRE_FILTER_ALL);
    assert.strictEqual(resolveSessionFilter('sess-a', undefined), 'sess-a');
  });

  it('maps Active session to the selected id, or null when none', () => {
    assert.strictEqual(resolveSessionFilter(RPC_WIRE_FILTER_ACTIVE_SESSION, 'sess-a'), 'sess-a');
    assert.strictEqual(resolveSessionFilter(RPC_WIRE_FILTER_ACTIVE_SESSION, undefined), null);
  });
});
