import { assert, describe, it } from '@effect/vitest';

import type { RpcWireEntry } from '../../host/backendHarness.ts';

import {
  cascadedWireIds,
  classifyRpcWireLog,
  coerceWireIdFilter,
  filterClassifiedRpcWireEntries,
  mergeClassifiedRpcWireLogs,
  resolveSessionFilter,
  RPC_WIRE_FILTER_ALL,
  sessionKeysForProvider,
} from './rpcWireLogFilter.ts';

const entry = (
  direction: 'in' | 'out',
  message: unknown,
  options?: { id?: string; receivedAt?: number },
): RpcWireEntry => ({
  direction,
  id: options?.id ?? crypto.randomUUID(),
  message,
  receivedAt: options?.receivedAt,
});

const classify = (entries: readonly RpcWireEntry[]) => classifyRpcWireLog(entries, 'codex-acp');

describe('classifyRpcWireLog', () => {
  it('marks initialize request as system', () => {
    const { classified } = classify([
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
    assert.strictEqual(classified[0]?.launchTarget, 'codex-acp');
  });

  it('uses payload.sessionId for session/prompt', () => {
    const { classified } = classify([
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
    const { classified } = classify([
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
    const { classified } = classify([
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
    const { classified } = classify([
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
    const { sessionKeys, tags } = classify([
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

describe('mergeClassifiedRpcWireLogs', () => {
  it('keeps id correlation per provider and sorts by receivedAt', () => {
    const merged = mergeClassifiedRpcWireLogs([
      classifyRpcWireLog(
        [
          entry(
            'out',
            { _tag: 'Request', id: 1, payload: { prompt: [], sessionId: 'codex-sess' }, tag: 'session/prompt' },
            { receivedAt: 200 },
          ),
          entry('in', { _tag: 'Exit', exit: { _tag: 'Success', value: {} }, requestId: 1 }, { receivedAt: 201 }),
        ],
        'codex-acp',
      ),
      classifyRpcWireLog(
        [
          entry(
            'out',
            { _tag: 'Request', id: 1, payload: { prompt: [], sessionId: 'claude-sess' }, tag: 'session/prompt' },
            { receivedAt: 100 },
          ),
          entry('in', { _tag: 'Exit', exit: { _tag: 'Success', value: {} }, requestId: 1 }, { receivedAt: 101 }),
        ],
        'claude-agent-acp',
      ),
    ]);
    assert.deepStrictEqual(
      merged.classified.map(row => row.facet.sessionKey),
      ['claude-sess', 'claude-sess', 'codex-sess', 'codex-sess'],
    );
    assert.strictEqual(merged.classified[0]?.launchTarget, 'claude-agent-acp');
    assert.strictEqual(merged.classified[2]?.launchTarget, 'codex-acp');
  });
});

describe('filterClassifiedRpcWireEntries', () => {
  const { classified } = classify([
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

  it('ANDs provider + session + tag + wireId filters', () => {
    const filtered = filterClassifiedRpcWireEntries(classified, {
      provider: 'codex-acp',
      sessionKey: 'sess-a',
      tag: 'session/prompt',
      wireId: '2',
    });
    assert.strictEqual(filtered.length, 2);
    assert.ok(filtered.every(row => row.facet.wireId === '2'));
  });

  it('All leaves a dimension unconstrained', () => {
    const filtered = filterClassifiedRpcWireEntries(classified, {
      provider: RPC_WIRE_FILTER_ALL,
      sessionKey: 'sess-a',
      tag: RPC_WIRE_FILTER_ALL,
      wireId: RPC_WIRE_FILTER_ALL,
    });
    assert.strictEqual(filtered.length, 3);
  });

  it('provider filter excludes other launch targets', () => {
    const mixed = mergeClassifiedRpcWireLogs([
      classifyRpcWireLog(
        [entry('out', { _tag: 'Request', id: 1, payload: { sessionId: 'a' }, tag: 'session/prompt' })],
        'codex-acp',
      ),
      classifyRpcWireLog(
        [entry('out', { _tag: 'Request', id: 1, payload: { sessionId: 'b' }, tag: 'session/prompt' })],
        'claude-agent-acp',
      ),
    ]).classified;
    const filtered = filterClassifiedRpcWireEntries(mixed, {
      provider: 'claude-agent-acp',
      sessionKey: RPC_WIRE_FILTER_ALL,
      tag: RPC_WIRE_FILTER_ALL,
      wireId: RPC_WIRE_FILTER_ALL,
    });
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0]?.facet.sessionKey, 'b');
  });
});

describe('sessionKeysForProvider', () => {
  it('lists only sessions for the selected provider', () => {
    const mixed = mergeClassifiedRpcWireLogs([
      classifyRpcWireLog(
        [
          entry('out', { _tag: 'Request', id: 1, payload: {}, tag: 'initialize' }),
          entry('out', { _tag: 'Request', id: 2, payload: { sessionId: 'codex-sess' }, tag: 'session/prompt' }),
        ],
        'codex-acp',
      ),
      classifyRpcWireLog(
        [entry('out', { _tag: 'Request', id: 1, payload: { sessionId: 'claude-sess' }, tag: 'session/prompt' })],
        'claude-agent-acp',
      ),
    ]).classified;
    assert.deepStrictEqual(sessionKeysForProvider(mixed, 'codex-acp'), ['system', 'codex-sess']);
    assert.deepStrictEqual(sessionKeysForProvider(mixed, 'claude-agent-acp'), ['claude-sess']);
    assert.deepStrictEqual(sessionKeysForProvider(mixed, RPC_WIRE_FILTER_ALL), ['system', 'codex-sess', 'claude-sess']);
  });
});

describe('cascadedWireIds / coerceWireIdFilter', () => {
  const { classified } = classify([
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

  it('cascades id options from provider + session (+ tag) slice', () => {
    assert.deepStrictEqual(
      cascadedWireIds(classified, {
        provider: 'codex-acp',
        sessionKey: 'sess-a',
        tag: RPC_WIRE_FILTER_ALL,
      }),
      ['2', ''],
    );
    assert.deepStrictEqual(
      cascadedWireIds(classified, {
        provider: 'codex-acp',
        sessionKey: 'sess-a',
        tag: 'session/prompt',
      }),
      ['2'],
    );
  });

  it('resets stale wireId to All when missing from cascaded options', () => {
    assert.strictEqual(coerceWireIdFilter('1', ['2', '']), RPC_WIRE_FILTER_ALL);
    assert.strictEqual(coerceWireIdFilter('2', ['2', '']), '2');
    assert.strictEqual(coerceWireIdFilter('', ['2', '']), '');
    assert.strictEqual(coerceWireIdFilter(RPC_WIRE_FILTER_ALL, ['2']), RPC_WIRE_FILTER_ALL);
  });
});

describe('resolveSessionFilter', () => {
  it('passes through concrete session and All when toggle is off', () => {
    assert.strictEqual(resolveSessionFilter(false, RPC_WIRE_FILTER_ALL, undefined), RPC_WIRE_FILTER_ALL);
    assert.strictEqual(resolveSessionFilter(false, 'sess-a', undefined), 'sess-a');
  });

  it('maps Active session toggle to the selected id, or null when none', () => {
    assert.strictEqual(resolveSessionFilter(true, RPC_WIRE_FILTER_ALL, 'sess-a'), 'sess-a');
    assert.strictEqual(resolveSessionFilter(true, 'ignored', undefined), null);
  });
});
