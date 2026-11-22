import { assert, describe, it } from '@effect/vitest';

import type { RpcWireEntry } from '../../host/backendHarness.ts';

import {
  cascadedTags,
  cascadedWireIds,
  classifyRpcWireLog,
  coerceToAvailable,
  filterClassifiedRpcWireEntries,
  mergeClassifiedRpcWireLogs,
  resolveSessionFilter,
  RPC_WIRE_FILTER_ALL,
  RPC_WIRE_SYSTEM_SESSION_KEY,
  sessionKeysForLaunchTarget,
} from './rpcWireLogFilter.ts';

const entry = (
  direction: 'in' | 'out',
  message: unknown,
  options?: { id?: string; receivedAt?: number },
): RpcWireEntry => ({
  direction,
  id: options?.id ?? crypto.randomUUID(),
  message,
  receivedAt: options?.receivedAt ?? 0,
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
    assert.strictEqual(classified[0]?.meta.sessionKey, RPC_WIRE_SYSTEM_SESSION_KEY);
    assert.strictEqual(classified[0]?.meta.tag, 'initialize');
    assert.strictEqual(classified[0]?.meta.wireId, '1');
    assert.strictEqual(classified[0]?.meta.title, '→ initialize');
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
    assert.strictEqual(classified[0]?.meta.sessionKey, 'sess-a');
    assert.strictEqual(classified[0]?.meta.tag, 'session/prompt');
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
    assert.strictEqual(classified[0]?.meta.tag, 'session/update agent_message_chunk');
    assert.strictEqual(classified[0]?.meta.wireId, null);
    assert.strictEqual(classified[0]?.meta.sessionKey, 'sess-a');
    assert.strictEqual(classified[0]?.meta.title, '← session/update agent_message_chunk');
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
    assert.strictEqual(classified[1]?.meta.tag, 'session/prompt');
    assert.strictEqual(classified[1]?.meta.sessionKey, 'sess-b');
    assert.strictEqual(classified[1]?.meta.wireId, '3');
    assert.strictEqual(classified[1]?.meta.title, '← session/prompt');
    assert.strictEqual(classified[2]?.meta.tag, 'session/prompt');
    assert.strictEqual(classified[2]?.meta.sessionKey, 'sess-b');
    assert.strictEqual(classified[3]?.meta.tag, 'session/prompt');
    assert.strictEqual(classified[3]?.meta.sessionKey, 'sess-b');
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
    assert.strictEqual(classified[0]?.meta.sessionKey, 'sess-new');
    assert.strictEqual(classified[0]?.meta.tag, 'session/new');
    assert.strictEqual(classified[1]?.meta.sessionKey, 'sess-new');
    assert.strictEqual(classified[1]?.meta.tag, 'session/new');
    assert.strictEqual(classified[1]?.meta.title, '← session/new');
  });

  it('collects distinct session options from the full log', () => {
    const { sessionKeys } = classify([
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
    assert.deepStrictEqual(sessionKeys, [RPC_WIRE_SYSTEM_SESSION_KEY, 'sess-a']);
  });
});

describe('classifyRpcWireLog id correlation', () => {
  const notification = (tag: string, payload: unknown) => ({
    _tag: 'Request',
    headers: [],
    id: '',
    isNotification: true,
    payload,
    tag,
  });

  it('keeps a notification without sessionId in system (no inheritance via shared "" id)', () => {
    const { classified } = classify([
      entry('in', notification('session/update', { sessionId: 'sess-a', update: { sessionUpdate: 'plan' } })),
      entry('in', notification('_auth/status_update', { status: 'ok' })),
      entry('in', notification('session/update', { sessionId: 'sess-b', update: { sessionUpdate: 'plan' } })),
    ]);
    assert.strictEqual(classified[1]?.meta.sessionKey, RPC_WIRE_SYSTEM_SESSION_KEY);
    assert.strictEqual(classified[1]?.meta.wireId, null);
  });

  it('does not correlate an agent-originated request id with a client request of the same id', () => {
    const { classified } = classify([
      entry('in', { _tag: 'Request', id: 3, payload: { sessionId: 'sess-b' }, tag: 'session/request_permission' }),
      entry('out', { _tag: 'Request', id: 3, payload: { prompt: [], sessionId: 'sess-a' }, tag: 'session/prompt' }),
      entry('out', { _tag: 'Exit', exit: { _tag: 'Success', value: {} }, requestId: 3 }),
    ]);
    assert.strictEqual(classified[2]?.meta.tag, 'session/request_permission');
    assert.strictEqual(classified[2]?.meta.sessionKey, 'sess-b');
  });
});

describe('mergeClassifiedRpcWireLogs', () => {
  it('keeps id correlation per launch target and sorts by receivedAt', () => {
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
      merged.classified.map(row => row.meta.sessionKey),
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

  it('ANDs launchTarget + session + tag + wireId filters', () => {
    const filtered = filterClassifiedRpcWireEntries(classified, {
      launchTarget: 'codex-acp',
      sessionKey: 'sess-a',
      tag: 'session/prompt',
      wireId: '2',
    });
    assert.strictEqual(filtered.length, 2);
    assert.ok(filtered.every(row => row.meta.wireId === '2'));
  });

  it('All leaves a dimension unconstrained', () => {
    const filtered = filterClassifiedRpcWireEntries(classified, {
      launchTarget: RPC_WIRE_FILTER_ALL,
      sessionKey: 'sess-a',
      tag: RPC_WIRE_FILTER_ALL,
      wireId: RPC_WIRE_FILTER_ALL,
    });
    assert.strictEqual(filtered.length, 3);
  });

  it('launchTarget filter excludes other launch targets', () => {
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
      launchTarget: 'claude-agent-acp',
      sessionKey: RPC_WIRE_FILTER_ALL,
      tag: RPC_WIRE_FILTER_ALL,
      wireId: RPC_WIRE_FILTER_ALL,
    });
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0]?.meta.sessionKey, 'b');
  });
});

describe('sessionKeysForLaunchTarget', () => {
  it('lists only sessions for the selected launch target', () => {
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
    assert.deepStrictEqual(sessionKeysForLaunchTarget(mixed, 'codex-acp'), [RPC_WIRE_SYSTEM_SESSION_KEY, 'codex-sess']);
    assert.deepStrictEqual(sessionKeysForLaunchTarget(mixed, 'claude-agent-acp'), ['claude-sess']);
    assert.deepStrictEqual(sessionKeysForLaunchTarget(mixed, RPC_WIRE_FILTER_ALL), [
      RPC_WIRE_SYSTEM_SESSION_KEY,
      'codex-sess',
      'claude-sess',
    ]);
  });
});

describe('cascadedWireIds / coerceToAvailable', () => {
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

  it('cascades id options from launchTarget + session (+ tag) slice', () => {
    assert.deepStrictEqual(
      cascadedWireIds(classified, {
        launchTarget: 'codex-acp',
        sessionKey: 'sess-a',
        tag: RPC_WIRE_FILTER_ALL,
      }),
      ['2'],
    );
    assert.deepStrictEqual(
      cascadedWireIds(classified, {
        launchTarget: 'codex-acp',
        sessionKey: 'sess-a',
        tag: 'session/prompt',
      }),
      ['2'],
    );
  });

  it('resets stale wireId to All when missing from cascaded options', () => {
    assert.strictEqual(coerceToAvailable('1', ['2', '']), RPC_WIRE_FILTER_ALL);
    assert.strictEqual(coerceToAvailable('2', ['2', '']), '2');
    assert.strictEqual(coerceToAvailable('', ['2', '']), '');
    assert.strictEqual(coerceToAvailable(RPC_WIRE_FILTER_ALL, ['2']), RPC_WIRE_FILTER_ALL);
  });
});

describe('cascadedTags / coerceToAvailable', () => {
  const { classified } = classifyRpcWireLog(
    [
      entry('out', { _tag: 'Request', id: 1, payload: { prompt: [], sessionId: 'sess-a' }, tag: 'session/prompt' }),
      entry('out', { _tag: 'Request', id: 2, payload: { sessionId: 'sess-b' }, tag: 'session/cancel' }),
    ],
    'codex-acp',
  );

  it('lists only tags present in the launchTarget + session slice', () => {
    assert.deepStrictEqual(cascadedTags(classified, { launchTarget: 'codex-acp', sessionKey: 'sess-a' }), [
      'session/prompt',
    ]);
    assert.deepStrictEqual(
      cascadedTags(classified, { launchTarget: RPC_WIRE_FILTER_ALL, sessionKey: RPC_WIRE_FILTER_ALL }),
      ['session/prompt', 'session/cancel'],
    );
  });

  it('resets a stale tag to All', () => {
    assert.strictEqual(coerceToAvailable('session/cancel', ['session/prompt']), RPC_WIRE_FILTER_ALL);
    assert.strictEqual(coerceToAvailable('session/prompt', ['session/prompt']), 'session/prompt');
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
