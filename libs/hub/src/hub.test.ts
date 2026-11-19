/**
 * The hub's network surface: a real hub on an ephemeral port, driven by raw MCP-over-HTTP (the agent side) and
 * WebSocket clients (the Harness side). `it.live`: real sockets and real timers, not the TestClock.
 */
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Fiber, Layer, Scope } from 'effect';
import type { Duration } from 'effect';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startHub } from './hub.ts';
import { runHubProcess } from './hubProcess.ts';
import { clientsQuery, HUB_APP_ID, HUB_TOOL_NAMES, MAX_HANDOFF_DOCUMENT_CHARS, PROTOCOL_VERSION } from './protocol.ts';
import { connectTestClient, mcpCallTool, mcpInitialize, mcpPost, registerToken, rpcResult } from './testing.ts';
import { HubToolkit } from './tools.ts';

const SECRET = 'test-secret';

const hubUp = (idleGrace: Duration.Input = '5 seconds', port = 0) => startHub({ idleGrace, port, secret: SECRET });
const mcpUrl = (port: number) => `http://127.0.0.1:${port}/mcp`;
const listTools = { id: 2, jsonrpc: '2.0', method: 'tools/list' };

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

  it.live('/clients rejects a bad secret, a protocol version mismatch and an unknown client kind', () =>
    Effect.gen(function* () {
      const { port } = yield* hubUp();
      const good = new URLSearchParams(clientsQuery({ clientKind: 'test', secret: SECRET }));
      const variant = (key: string, value: string) => {
        const query = new URLSearchParams(good);
        query.set(key, value);
        return Effect.exit(connectTestClient(port, query.toString()));
      };
      assert.isTrue(Exit.isFailure(yield* variant('secret', 'nope')));
      assert.isTrue(Exit.isFailure(yield* variant('protocolVersion', '999')));
      assert.isTrue(Exit.isFailure(yield* variant('clientKind', 'toaster')));
    }).pipe(Effect.scoped),
  );

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
          assert.strictEqual((statSync(discovery).mode % 0o1000).toString(8), '600');
        }),
      );
      assert.isFalse(existsSync(discovery));
    }).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
  );
});
