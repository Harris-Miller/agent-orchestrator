/**
 * The hub's network surface: a real hub on an ephemeral port, driven by raw MCP-over-HTTP (the agent side) and
 * WebSocket clients (the Harness side). `it.live`: real sockets and real timers, not the TestClock.
 */
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { assert, describe, it } from '@effect/vitest';
import { Cause, Effect, Exit, Fiber, Layer, Logger, Metric, Option, References, Schedule, Scope, Tracer } from 'effect';
import type { Duration } from 'effect';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startHub } from './hub.ts';
import { runHubProcess } from './hubProcess.ts';
import { clientsQuery, HUB_APP_ID, HUB_TOOL_NAMES, MAX_HANDOFF_DOCUMENT_CHARS, PROTOCOL_VERSION } from './protocol.ts';
import type { TestClient } from './testing.ts';
import {
  connectTestClient,
  mcpCallTool,
  mcpInitialize,
  mcpPost,
  registerToken,
  rpcResult,
  testClientQuery,
} from './testing.ts';
import { HubToolkit } from './tools.ts';

const SECRET = 'test-secret';

const hubUp = (idleGrace: Duration.Input = '5 seconds', port = 0) => startHub({ idleGrace, port, secret: SECRET });
const mcpUrl = (port: number) => `http://127.0.0.1:${port}/mcp`;
const listTools = { id: 2, jsonrpc: '2.0', method: 'tools/list' };

/** Spans and log lines the hub emitted, captured in memory (no exporter). */
const capture = () => {
  const spans: Tracer.NativeSpan[] = [];
  const logs: { readonly annotations: Record<string, unknown>; readonly message: unknown }[] = [];
  const layer = Layer.mergeAll(
    Layer.succeed(
      Tracer.Tracer,
      Tracer.make({
        span: options => {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      }),
    ),
    Logger.layer([
      Logger.make(options => {
        logs.push({ annotations: options.fiber.getRef(References.CurrentLogAnnotations), message: options.message });
      }),
    ]),
  );
  return { layer, logs, spans };
};

const TOOL_CALL_ATTRIBUTE_ALLOWLIST = [
  'acp.launch_target',
  'acp.session.id',
  'acp.session.parent_id',
  'app_session.id',
  // Inherited from the MCP request span's annotations (allowlisted there too).
  'gen_ai.tool.name',
  'hub.client.kind',
  'hub.outcome',
  'hub.tool',
];

/** Every span the hub emits and its allowed attribute keys: the hub's own, plus Effect's MCP protocol spans. No HTTP server spans. */
const MCP_SPAN_ATTRIBUTE_ALLOWLIST = [
  'gen_ai.operation.name',
  'gen_ai.tool.name',
  'jsonrpc.request.id',
  'mcp.method.name',
  'mcp.protocol.version',
  'mcp.session.id',
  'network.transport',
  'rpc.method',
  'rpc.system.name',
];
const allowedSpanKeys = (name: string): readonly string[] | undefined =>
  name === 'hub.toolCall'
    ? TOOL_CALL_ATTRIBUTE_ALLOWLIST
    : name === 'initialize' || name.startsWith('tools/call ') || name.startsWith('McpServer/Notifications.')
      ? MCP_SPAN_ATTRIBUTE_ALLOWLIST
      : undefined;

/** Call `submit_handoff` as `token` through `owner` and answer it with `resultText`. */
const callHandoff = Effect.fnUntraced(function* (
  port: number,
  owner: TestClient,
  token: string,
  document: string,
  resultText: string,
) {
  const { sessionId } = yield* mcpInitialize(mcpUrl(port), token);
  const call = yield* Effect.forkChild(mcpCallTool(mcpUrl(port), token, sessionId, 'submit_handoff', { document }));
  const routed = yield* Effect.promise(() => owner.waitFor(m => m.type === 'toolCall' && m.token === token));
  owner.send({ isError: false, requestId: routed.requestId, text: resultText, type: 'toolResult' });
  yield* Fiber.join(call);
});

const spanFailed = (span: Tracer.NativeSpan | undefined) =>
  span?.status._tag === 'Ended' && Exit.isFailure(span.status.exit);

const toolCallSpans = (spans: readonly Tracer.NativeSpan[]) => spans.filter(span => span.name === 'hub.toolCall');

describe('hub', () => {
  it('declares exactly the tools the protocol names', () => {
    assert.deepStrictEqual(Object.keys(HubToolkit.tools).toSorted(), [...HUB_TOOL_NAMES].toSorted());
  });

  it.live('/health identifies the hub and its protocol version, readable cross-origin', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const response = yield* Effect.promise(() => fetch(`http://127.0.0.1:${port}/health`));
      assert.strictEqual(response.headers.get('access-control-allow-origin'), '*');
      assert.deepStrictEqual(yield* Effect.promise(() => response.json()), {
        app: HUB_APP_ID,
        pid: process.pid,
        protocolVersion: PROTOCOL_VERSION,
      });
    }).pipe(Effect.scoped),
  );

  it.live(
    '/clients rejects a bad secret, a protocol version mismatch, an unknown client kind and a bad app session id',
    () =>
      Effect.gen(function* () {
        const { port } = yield* hubUp();
        const good = new URLSearchParams(clientsQuery({ appSessionId: 'app-1', clientKind: 'test', secret: SECRET }));
        const variant = (key: string, value: string) => {
          const query = new URLSearchParams(good);
          query.set(key, value);
          return Effect.exit(connectTestClient(port, query.toString()));
        };
        assert.isTrue(Exit.isFailure(yield* variant('secret', 'nope')));
        assert.isTrue(Exit.isFailure(yield* variant('protocolVersion', '999')));
        assert.isTrue(Exit.isFailure(yield* variant('clientKind', 'toaster')));
        assert.isTrue(Exit.isFailure(yield* variant('appSessionId', 'has spaces & <free text>')));
        assert.isTrue(Exit.isFailure(yield* variant('appSessionId', '')));
        const missing = new URLSearchParams(good);
        missing.delete('appSessionId');
        assert.isTrue(Exit.isFailure(yield* Effect.exit(connectTestClient(port, missing.toString()))));
      }).pipe(Effect.scoped),
  );

  it.live('a tool-call span carries the bound ACP session, its agent, the owning app session and the tool', () => {
    const { layer, spans } = capture();
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port, testClientQuery('app-run-1'));
      yield* registerToken(owner, 'tok-span');
      owner.send({ launchTarget: 'claude-agent-acp', sessionId: 'acp-s1', token: 'tok-span', type: 'bind' });
      yield* registerToken(owner, 'tok-sync'); // frames are ordered: the bind has landed once this is answered
      yield* callHandoff(port, owner, 'tok-span', 'doc', 'ok');

      const [span] = toolCallSpans(spans);
      assert.deepStrictEqual(Object.fromEntries(span?.attributes ?? []), {
        'acp.launch_target': 'claude-agent-acp',
        'acp.session.id': 'acp-s1',
        'app_session.id': 'app-run-1',
        'gen_ai.tool.name': 'submit_handoff',
        'hub.client.kind': 'test',
        'hub.outcome': 'ok',
        'hub.tool': 'submit_handoff',
      });
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live('a Spawned subagent session names its parent session on the tool-call span', () => {
    const { layer, spans } = capture();
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port, testClientQuery('app-run-1'));
      yield* registerToken(owner, 'tok-child');
      owner.send({
        launchTarget: 'claude-agent-acp',
        parentSessionId: 'acp-parent',
        sessionId: 'acp-child',
        token: 'tok-child',
        type: 'bind',
      });
      yield* registerToken(owner, 'tok-sync');
      yield* callHandoff(port, owner, 'tok-child', 'doc', 'ok');

      const [span] = toolCallSpans(spans);
      assert.strictEqual(span?.attributes.get('acp.session.id'), 'acp-child');
      assert.strictEqual(span?.attributes.get('acp.session.parent_id'), 'acp-parent');
      for (const key of span?.attributes.keys() ?? []) {
        assert.include(TOOL_CALL_ATTRIBUTE_ALLOWLIST, key);
      }
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live('a pending (unbound) token has no ACP session on its span', () => {
    const { layer, spans } = capture();
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-pending');
      yield* callHandoff(port, owner, 'tok-pending', 'doc', 'ok');
      const [span] = toolCallSpans(spans);
      assert.isFalse(span?.attributes.has('acp.session.id'));
      assert.isFalse(span?.attributes.has('acp.launch_target'));
      assert.strictEqual(span?.attributes.get('app_session.id'), 'test-app-session');
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live('a call whose owner disconnects before answering ends with outcome error and an error span status', () => {
    const { layer, spans } = capture();
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-gone');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-gone');
      const call = yield* Effect.forkChild(
        mcpCallTool(mcpUrl(port), 'tok-gone', sessionId, 'submit_handoff', { document: 'doc' }),
      );
      yield* Effect.promise(() => owner.waitFor(m => m.type === 'toolCall'));
      owner.close();
      const result = yield* Fiber.join(call);
      assert.isTrue(result.isError);
      const [span] = toolCallSpans(spans);
      assert.strictEqual(span?.attributes.get('hub.outcome'), 'error');
      assert.strictEqual(span?.attributes.get('hub.tool'), 'submit_handoff');
      assert.strictEqual(spanFailed(span), true);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live('each call span carries its own owner’s app session id', () => {
    const { layer, spans } = capture();
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const one = yield* connectTestClient(port, testClientQuery('app-one'));
      const two = yield* connectTestClient(port, testClientQuery('app-two'));
      yield* registerToken(one, 'tok-one');
      yield* registerToken(two, 'tok-two');
      yield* callHandoff(port, one, 'tok-one', 'a', 'ok');
      yield* callHandoff(port, two, 'tok-two', 'b', 'ok');
      assert.deepStrictEqual(
        toolCallSpans(spans).map(span => span.attributes.get('app_session.id')),
        ['app-one', 'app-two'],
      );
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live(
    'every call is its own trace: hub.toolCall and the MCP spans are roots even under a long-lived hub span',
    () => {
      const { layer, spans } = capture();
      return Effect.gen(function* () {
        const { port } = yield* hubUp();
        const owner = yield* connectTestClient(port);
        yield* registerToken(owner, 'tok-root-1');
        yield* registerToken(owner, 'tok-root-2');
        yield* callHandoff(port, owner, 'tok-root-1', 'doc', 'ok');
        yield* callHandoff(port, owner, 'tok-root-2', 'doc', 'ok');
        const calls = toolCallSpans(spans);
        assert.lengthOf(calls, 2);
        for (const span of spans.filter(
          s => s.name === 'hub.toolCall' || s.name.startsWith('tools/call') || s.name === 'initialize',
        )) {
          assert.isTrue(Option.isNone(span.parent), `${span.name} has a parent`);
        }
        assert.notStrictEqual(calls[0]?.traceId, calls[1]?.traceId);
        assert.isFalse(spanFailed(calls[0]));
      }).pipe(Effect.withSpan('runHubProcess'), Effect.scoped, Effect.provide(layer));
    },
  );

  it.live('a call rejected before routing (invalid arguments) gets a hub.toolCall span with outcome rejected', () => {
    const { layer, spans } = capture();
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-bad');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-bad');
      yield* mcpCallTool(mcpUrl(port), 'tok-bad', sessionId, 'submit_handoff', { document: 12_345 });
      assert.isUndefined(owner.received.find(m => m.type === 'toolCall'));
      const [span] = toolCallSpans(spans);
      assert.strictEqual(span?.attributes.get('hub.outcome'), 'rejected');
      assert.strictEqual(span?.attributes.get('hub.tool'), 'submit_handoff');
      assert.isTrue(spanFailed(span));
      assert.notInclude(JSON.stringify([...(span?.attributes ?? [])]), '12345');
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live('an unknown tool name never reaches hub.tool', () => {
    const { layer, spans } = capture();
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-unk');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-unk');
      yield* mcpCallTool(mcpUrl(port), 'tok-unk', sessionId, 'free text tool <name>', {});
      for (const span of toolCallSpans(spans)) {
        assert.strictEqual(span.attributes.get('hub.tool'), 'unknown');
      }
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live('a tool result with isError ends with outcome error; the result text stays off the span', () => {
    const { layer, spans } = capture();
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-err');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-err');
      const call = yield* Effect.forkChild(
        mcpCallTool(mcpUrl(port), 'tok-err', sessionId, 'submit_handoff', { document: 'doc' }),
      );
      const routed = yield* Effect.promise(() => owner.waitFor(m => m.type === 'toolCall'));
      owner.send({ isError: true, requestId: routed.requestId, text: 'SECRET-RESULT-TEXT', type: 'toolResult' });
      const result = yield* Fiber.join(call);
      assert.isTrue(result.isError);
      const [span] = toolCallSpans(spans);
      assert.strictEqual(span?.attributes.get('hub.outcome'), 'error');
      assert.isTrue(spanFailed(span));
      assert.notInclude(
        JSON.stringify({ attributes: [...(span?.attributes ?? [])], status: span?.status._tag }),
        'SECRET',
      );
      assert.notInclude(JSON.stringify(span?.events), 'SECRET');
      const status = span?.status;
      assert.notInclude(
        status?._tag === 'Ended' ? Cause.pretty(Exit.isFailure(status.exit) ? status.exit.cause : Cause.empty) : '',
        'SECRET',
      );
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live('records hub.tool_calls and hub.tool_call.duration by tool and outcome', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-metric');
      yield* callHandoff(port, owner, 'tok-metric', 'doc', 'ok');
      const snapshot = yield* Metric.snapshot;
      const counter = snapshot.find(
        metric =>
          metric.id === 'hub.tool_calls' &&
          metric.attributes?.['hub.tool'] === 'submit_handoff' &&
          metric.attributes['hub.outcome'] === 'ok',
      );
      assert.isDefined(counter);
      assert.isTrue(
        snapshot.some(metric => metric.id === 'hub.tool_call.duration' && metric.attributes?.['hub.outcome'] === 'ok'),
      );
    }).pipe(Effect.scoped),
  );

  it.live('an abandoned (interrupted) call is recorded once with outcome interrupted', () => {
    const { layer, spans } = capture();
    const interruptedCount = Effect.map(Metric.snapshot, snapshot =>
      snapshot
        .filter(metric => metric.id === 'hub.tool_calls' && metric.attributes?.['hub.outcome'] === 'interrupted')
        .reduce((sum, metric) => sum + Number((metric.state as { count: number | bigint }).count), 0),
    );
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-int');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-int');
      const before = yield* interruptedCount;
      const call = yield* Effect.forkChild(
        mcpCallTool(mcpUrl(port), 'tok-int', sessionId, 'submit_handoff', { document: 'doc' }),
      );
      yield* Effect.promise(() => owner.waitFor(m => m.type === 'toolCall'));
      yield* Fiber.interrupt(call);
      yield* Effect.repeat(Effect.sleep('10 millis'), {
        until: () => toolCallSpans(spans).some(span => span.attributes.get('hub.outcome') === 'interrupted'),
      }).pipe(Effect.timeout('5 seconds'));
      const interrupted = toolCallSpans(spans).filter(span => span.attributes.get('hub.outcome') === 'interrupted');
      assert.lengthOf(interrupted, 1);
      assert.strictEqual(interrupted[0]?.status._tag, 'Ended');
      assert.isFalse(spanFailed(interrupted[0]));
      const after = yield* interruptedCount;
      assert.strictEqual(after - before, 1);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live('routes the call with the hub.toolCall span’s trace context', () => {
    const { layer, spans } = capture();
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-trace');
      yield* callHandoff(port, owner, 'tok-trace', 'doc', 'ok');
      const routed = owner.received.find(m => m.type === 'toolCall');
      const [span] = toolCallSpans(spans);
      assert.deepStrictEqual(routed?.trace, { sampled: span?.sampled, spanId: span?.spanId, traceId: span?.traceId });
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live('ADR 0002: no span or log carries tool args, results or the bearer token; span keys are allowlisted', () => {
    const { layer, logs, spans } = capture();
    const CANARY = 'CANARY-7f3a91';
    return Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-bearer-9d2c');
      owner.send({
        launchTarget: 'claude-agent-acp',
        parentSessionId: 'acp-canary-parent',
        sessionId: 'acp-canary',
        token: 'tok-bearer-9d2c',
        type: 'bind',
      });
      yield* registerToken(owner, 'tok-sync');
      yield* callHandoff(port, owner, 'tok-bearer-9d2c', `plan ${CANARY}`, `result ${CANARY}`);
      owner.close();
      // The hub has processed the disconnect once the owner's token stops authenticating.
      yield* mcpPost(mcpUrl(port), 'tok-bearer-9d2c', listTools).pipe(
        Effect.repeat({ until: ({ response }) => response.status === 401, schedule: Schedule.spaced('10 millis') }),
        Effect.timeout('5 seconds'),
      );

      assert.isAbove(toolCallSpans(spans).length, 0);
      for (const span of spans) {
        const allowed = allowedSpanKeys(span.name);
        assert.isDefined(allowed, `unexpected span ${span.name}`);
        for (const key of span.attributes.keys()) {
          assert.include(allowed, key);
        }
      }
      const everything = JSON.stringify({
        logs: logs.map(log => ({ annotations: log.annotations, message: log.message })),
        spans: spans.map(span => ({
          attributes: [...span.attributes],
          events: span.events,
          name: span.name,
        })),
      });
      assert.notInclude(everything, CANARY);
      assert.notInclude(everything, 'tok-bearer-9d2c');
      assert.notInclude(everything, 'test-secret'); // the hub secret in the `/clients` query
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.live('acknowledges a registered token, after which the very next agent request authenticates', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const client = yield* connectTestClient(port);
      const ack = yield* registerToken(client, 'acked');
      assert.strictEqual(ack.accepted, true);
      const list = yield* mcpPost(mcpUrl(port), 'acked', listTools);
      assert.notStrictEqual(list.response.status, 401);
    }).pipe(Effect.scoped),
  );

  it.live('refuses to register a token another client already owns', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      const thief = yield* connectTestClient(port);
      yield* registerToken(owner, 'mine');
      const stolen = yield* registerToken(thief, 'mine');
      assert.strictEqual(stolen.accepted, false);
    }).pipe(Effect.scoped),
  );

  it.live('/mcp rejects missing, unknown and Origin-carrying requests', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const client = yield* connectTestClient(port);
      yield* registerToken(client, 'good');
      assert.strictEqual((yield* mcpPost(mcpUrl(port), undefined, listTools)).response.status, 401);
      assert.strictEqual((yield* mcpPost(mcpUrl(port), 'unknown', listTools)).response.status, 401);
      const withOrigin = yield* mcpPost(mcpUrl(port), 'good', listTools, {
        headers: { origin: 'https://evil.example' },
      });
      assert.isTrue(withOrigin.response.status >= 400);
    }).pipe(Effect.scoped),
  );

  it.live('negotiates the newest MCP protocol an agent asks for, down to one it supports', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const client = yield* connectTestClient(port);
      yield* registerToken(client, 'v');
      assert.strictEqual((yield* mcpInitialize(mcpUrl(port), 'v', '2025-11-25')).negotiated, '2025-11-25');
      assert.strictEqual((yield* mcpInitialize(mcpUrl(port), 'v', '2025-03-26')).negotiated, '2025-03-26');
      assert.strictEqual((yield* mcpInitialize(mcpUrl(port), 'v', '2099-01-01')).negotiated, '2025-11-25');
    }).pipe(Effect.scoped),
  );

  it.live('routes submit_handoff to the owning client only and returns its reply', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      const bystander = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-a');
      owner.send({ launchTarget: 'claude-agent-acp', sessionId: 's1', token: 'tok-a', type: 'bind' });

      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-a');
      const list = yield* mcpPost(mcpUrl(port), 'tok-a', listTools, { sessionId });
      assert.deepStrictEqual(
        rpcResult(list.text).result.tools.map(t => t.name),
        ['submit_handoff', 'list_subagent_targets', 'spawn_subagent', 'cancel_subagent', 'wait_subagent'],
      );

      const call = yield* Effect.forkChild(
        mcpCallTool(mcpUrl(port), 'tok-a', sessionId, 'submit_handoff', { document: 'the plan' }),
      );
      const routed = yield* Effect.promise(() => owner.waitFor(m => m.type === 'toolCall'));
      assert.strictEqual(routed.token, 'tok-a');
      assert.strictEqual(routed.tool, 'submit_handoff');
      assert.deepStrictEqual(routed.args, { document: 'the plan' });
      owner.send({ isError: false, requestId: routed.requestId, text: 'received', type: 'toolResult' });

      assert.deepStrictEqual((yield* Fiber.join(call)).content, [{ text: 'received', type: 'text' }]);
      assert.deepStrictEqual(
        bystander.received.filter(m => m.type === 'toolCall'),
        [],
      );
    }).pipe(Effect.scoped),
  );

  it.live('routes list_subagent_targets with empty args', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-list');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-list');
      const call = yield* Effect.forkChild(
        mcpCallTool(mcpUrl(port), 'tok-list', sessionId, 'list_subagent_targets', {}),
      );
      const routed = yield* Effect.promise(() => owner.waitFor(m => m.type === 'toolCall'));
      assert.strictEqual(routed.tool, 'list_subagent_targets');
      assert.deepStrictEqual(routed.args, {});
      owner.send({ isError: false, requestId: routed.requestId, text: '{}', type: 'toolResult' });
      assert.strictEqual((yield* Fiber.join(call)).isError, false);
    }).pipe(Effect.scoped),
  );

  it.live('keeps a call open while its owner is still working, and answers when the owner does', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-slow');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-slow');
      const call = yield* Effect.forkChild(
        mcpCallTool(mcpUrl(port), 'tok-slow', sessionId, 'submit_handoff', { document: 'slow' }),
      );
      const routed = yield* Effect.promise(() => owner.waitFor(m => m.type === 'toolCall'));
      yield* Effect.sleep('1500 millis');
      assert.isUndefined(call.pollUnsafe());
      owner.send({ isError: false, requestId: routed.requestId, text: 'late', type: 'toolResult' });
      assert.deepStrictEqual((yield* Fiber.join(call)).content, [{ text: 'late', type: 'text' }]);
    }).pipe(Effect.scoped),
  );

  it.live('refuses an oversize handoff document as invalid params, without routing it', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-big');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-big');
      const { text } = yield* mcpPost(
        mcpUrl(port),
        'tok-big',
        {
          id: 3,
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { arguments: { document: 'x'.repeat(MAX_HANDOFF_DOCUMENT_CHARS + 1) }, name: 'submit_handoff' },
        },
        { sessionId },
      );
      assert.strictEqual((JSON.parse(text) as { error: { code: number } }).error.code, -32602);
      assert.deepStrictEqual(
        owner.received.filter(m => m.type === 'toolCall'),
        [],
      );
    }).pipe(Effect.scoped),
  );

  it.live('does not serve an agent request body over 1 MiB', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-huge');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-huge');
      const huge = yield* Effect.exit(
        mcpPost(
          mcpUrl(port),
          'tok-huge',
          { ...listTools, params: { padding: 'x'.repeat(1024 * 1024) } },
          { sessionId },
        ),
      );
      if (Exit.isSuccess(huge) && huge.value.response.status < 400) {
        const reply = JSON.parse(huge.value.text) as { error?: { code: number } };
        assert.strictEqual(reply.error?.code, -32700);
      }
    }).pipe(Effect.scoped),
  );

  it.live('answers an unknown MCP session with 404, so an agent re-initializes after a hub restart', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-stale');
      const stale = yield* mcpPost(mcpUrl(port), 'tok-stale', listTools, { sessionId: 'from-the-previous-hub' });
      assert.strictEqual(stale.response.status, 404);
    }).pipe(Effect.scoped),
  );

  it.live('a call in flight fails, rather than hangs, when its owning client disconnects', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-gone');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'tok-gone');
      const call = yield* Effect.forkChild(
        mcpCallTool(mcpUrl(port), 'tok-gone', sessionId, 'submit_handoff', { document: 'x' }),
      );
      yield* Effect.promise(() => owner.waitFor(m => m.type === 'toolCall'));
      owner.close();
      const result = yield* Fiber.join(call).pipe(Effect.timeout('2 seconds'));
      assert.strictEqual(result.isError, true);
    }).pipe(Effect.scoped),
  );

  it.live('a revoked token and a disconnected owner both stop working', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const owner = yield* connectTestClient(port);
      yield* registerToken(owner, 'tok-b');
      owner.send({ token: 'tok-b', type: 'revoke' });
      yield* registerToken(owner, 'tok-c'); // frames are ordered: the revoke has landed once this is answered
      assert.strictEqual((yield* mcpPost(mcpUrl(port), 'tok-b', listTools)).response.status, 401);

      owner.close();
      yield* Effect.sleep('100 millis');
      assert.strictEqual((yield* mcpPost(mcpUrl(port), 'tok-c', listTools)).response.status, 401);
    }).pipe(Effect.scoped),
  );

  it.live('stops promptly while clients are still connected, closing their sockets', () =>
    Effect.gen(function* () {
      const hub = yield* Scope.make();
      const { port } = yield* hubUp().pipe(Scope.provide(hub));
      const client = yield* connectTestClient(port);
      const closed = Effect.promise(() => client.waitClosed);
      yield* Scope.close(hub, Exit.void).pipe(Effect.timeout('2 seconds'));
      yield* closed.pipe(Effect.timeout('1 second'));
    }).pipe(Effect.scoped),
  );

  it.live('a second hub cannot bind the same port', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      assert.isTrue(Exit.isFailure(yield* Effect.exit(hubUp('5 seconds', port))));
    }).pipe(Effect.scoped),
  );

  it.live('after a restart on the same port, re-registered tokens route again', () =>
    Effect.gen(function* () {
      const first = yield* Effect.scoped(
        Effect.gen(function* () {
          const { port } = yield* hubUp();
          const client = yield* connectTestClient(port);
          yield* registerToken(client, 'survivor');
          return port;
        }),
      );
      const { port } = yield* hubUp('5 seconds', first);
      const client = yield* connectTestClient(port);
      yield* registerToken(client, 'survivor');
      const { sessionId } = yield* mcpInitialize(mcpUrl(port), 'survivor');
      const call = yield* Effect.forkChild(
        mcpCallTool(mcpUrl(port), 'survivor', sessionId, 'submit_handoff', { document: 'again' }),
      );
      const routed = yield* Effect.promise(() => client.waitFor(m => m.type === 'toolCall'));
      client.send({ isError: false, requestId: routed.requestId, text: 'ok', type: 'toolResult' });
      assert.strictEqual((yield* Fiber.join(call)).isError, false);
    }).pipe(Effect.scoped),
  );

  it.live('exits after the idle grace once the last client leaves; a new client cancels it', () =>
    Effect.gen(function* () {
      const { awaitIdle, port } = yield* hubUp('300 millis');
      const isIdle = awaitIdle.pipe(
        Effect.timeoutOption('1 millis'),
        Effect.map(o => o._tag === 'Some'),
      );
      const first = yield* connectTestClient(port);
      yield* Effect.sleep('450 millis');
      assert.isFalse(yield* isIdle);
      first.close();
      yield* Effect.sleep('100 millis');
      const second = yield* connectTestClient(port);
      yield* Effect.sleep('450 millis');
      assert.isFalse(yield* isIdle);
      second.close();
      yield* awaitIdle.pipe(Effect.timeout('2 seconds'));
    }).pipe(Effect.scoped),
  );

  it.live('the process writes an owner-only discovery file and removes it on a clean exit', () =>
    Effect.gen(function* () {
      const home = mkdtempSync(join(tmpdir(), 'hoa-hub-'));
      const discovery = join(home, 'hub.json');
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* runHubProcess({ home, idleGrace: '5 seconds', port: 0 });
          assert.isTrue(existsSync(discovery));
          if (process.platform !== 'win32') {
            assert.strictEqual((statSync(discovery).mode % 0o1000).toString(8), '600');
          }
        }),
      );
      assert.isFalse(existsSync(discovery));
    }).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
  );
});
