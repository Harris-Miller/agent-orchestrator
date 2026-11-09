/** Which session RPCs inject the hub as an MCP server, and the credential lifecycle behind it. */
import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Fiber, Scope } from 'effect';
import { TestClock } from 'effect/testing';

import { bearerOf, installFakeAgent, installFakeHub } from '../atoms/fakeAgent.testing.ts';
import type { McpReceived } from '../atoms/fakeAgent.testing.ts';

import { setHubAvailability } from './hubConnection.ts';
import { currentHubUnavailableReason, handleHubToolCall } from './hubSessions.ts';
import { closeSession, createSession, deleteSession, forkSession, loadSession, resumeSession } from './sessionRpc.ts';

describe('hub MCP injection', () => {
  it.effect('new, load, resume and fork each carry a distinct hub server; new binds after the response', () =>
    Effect.gen(function* () {
      const hubCalls: string[] = [];
      yield* installFakeHub(hubCalls);
      const received: McpReceived[] = [];
      yield* installFakeAgent([], { mcp: { received } });

      yield* createSession('codex-acp', '/w');
      yield* loadSession('codex-acp', 's1', '/w');
      yield* resumeSession('codex-acp', 's2', '/w');
      yield* forkSession('codex-acp', 's3', '/w');

      assert.deepStrictEqual(
        received.map(r => r.rpc),
        ['new', 'load', 'resume', 'fork'],
      );
      for (const { servers } of received) {
        assert.strictEqual(servers.length, 1);
        const [server] = servers as readonly { name: string; type: string; url: string }[];
        assert.deepStrictEqual([server.name, server.type, server.url], ['hoa-hub', 'http', 'http://hub.test/mcp']);
      }
      assert.strictEqual(new Set(received.map(r => bearerOf(r.servers))).size, 4);
      // Registered before each RPC, bound once the session id is known.
      assert.deepStrictEqual(hubCalls, [
        'register',
        'bind:codex-acp:bound-1',
        'register',
        'bind:codex-acp:s1',
        'register',
        'bind:codex-acp:s2',
        'register',
        'bind:codex-acp:fork-1',
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect('injects nothing when the hub is unavailable or the agent lacks HTTP MCP', () =>
    Effect.gen(function* () {
      const received: McpReceived[] = [];
      // Agent supports HTTP MCP, but there is no hub.
      yield* installFakeAgent([], { mcp: { received } });
      yield* createSession('codex-acp', '/w');
      assert.deepStrictEqual(received[0].servers, []);
    }).pipe(Effect.scoped),
  );

  it.effect('injects nothing when the agent does not advertise HTTP MCP', () =>
    Effect.gen(function* () {
      const hubCalls: string[] = [];
      yield* installFakeHub(hubCalls);
      const received: McpReceived[] = [];
      yield* installFakeAgent([], { mcp: { http: false, received } });
      yield* createSession('codex-acp', '/w');
      assert.deepStrictEqual(hubCalls, []);
      assert.deepStrictEqual(received[0].servers, []);
    }).pipe(Effect.scoped),
  );

  it.effect('revokes the credential on close and on delete', () =>
    Effect.gen(function* () {
      const hubCalls: string[] = [];
      yield* installFakeHub(hubCalls);
      yield* installFakeAgent([], { mcp: { received: [] } });
      yield* createSession('codex-acp', '/w');
      yield* closeSession('codex-acp', 'bound-1');
      yield* createSession('codex-acp', '/w');
      yield* deleteSession('codex-acp', 'bound-2');
      assert.deepStrictEqual(
        hubCalls.filter(call => call === 'revoke'),
        ['revoke', 'revoke'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('re-issuing on load revokes the previous credential for that session', () =>
    Effect.gen(function* () {
      const hubCalls: string[] = [];
      yield* installFakeHub(hubCalls);
      yield* installFakeAgent([], { mcp: { received: [] } });
      yield* loadSession('codex-acp', 's1', '/w');
      yield* loadSession('codex-acp', 's1', '/w');
      assert.strictEqual(hubCalls.filter(call => call === 'revoke').length, 1);
    }).pipe(Effect.scoped),
  );

  it.live('a session RPC started while the hub is still connecting waits for it (startup Bind race)', () =>
    Effect.gen(function* () {
      setHubAvailability({ _tag: 'connecting' });
      const received: McpReceived[] = [];
      yield* installFakeAgent([], { mcp: { received } });
      const create = yield* Effect.forkChild(createSession('codex-acp', '/w'));
      yield* Effect.sleep('50 millis');
      yield* installFakeHub([]);
      yield* Fiber.join(create);
      assert.strictEqual(received[0].servers.length, 1);
      assert.strictEqual(currentHubUnavailableReason('codex-acp', 'bound-1'), undefined);
    }).pipe(Effect.scoped),
  );

  it.effect('a hub that never settles gives up after a few seconds and records why', () =>
    Effect.gen(function* () {
      setHubAvailability({ _tag: 'connecting' });
      const received: McpReceived[] = [];
      yield* installFakeAgent([], { mcp: { received } });
      const create = yield* Effect.forkChild(createSession('codex-acp', '/w'));
      yield* TestClock.adjust('5 seconds');
      yield* Fiber.join(create);
      assert.deepStrictEqual(received[0].servers, []);
      setHubAvailability({ _tag: 'unavailable', reason: 'down' });
    }).pipe(Effect.scoped),
  );

  it.effect('each session records why it has no hub connection', () =>
    Effect.gen(function* () {
      yield* installFakeHub([], { accept: false });
      yield* installFakeAgent([], { mcp: { received: [] } });
      yield* createSession('codex-acp', '/w');
      assert.include(currentHubUnavailableReason('codex-acp', 'bound-1'), 'did not accept');

      const claude = yield* Scope.make();
      yield* installFakeAgent([], { mcp: { http: false, received: [] } }, 'claude-agent-acp').pipe(
        Scope.provide(claude),
      );
      yield* createSession('claude-agent-acp', '/w');
      assert.include(currentHubUnavailableReason('claude-agent-acp', 'claude-1'), 'HTTP MCP');
      yield* Scope.close(claude, Exit.void);
    }).pipe(Effect.scoped),
  );

  it.effect('a lost Backend connection revokes every credential of that launch target', () =>
    Effect.gen(function* () {
      const hubCalls: string[] = [];
      yield* installFakeHub(hubCalls);
      const backend = yield* Scope.make();
      yield* installFakeAgent([], { mcp: { received: [] } }).pipe(Scope.provide(backend));
      yield* createSession('codex-acp', '/w');
      yield* createSession('codex-acp', '/w');
      yield* Scope.close(backend, Exit.void);
      assert.strictEqual(hubCalls.filter(call => call === 'revoke').length, 2);
      assert.isDefined(currentHubUnavailableReason('codex-acp', 'bound-1'));
    }).pipe(Effect.scoped),
  );

  it.effect('routes tool calls by credential and rejects unknown tools, bad args and unknown credentials', () =>
    Effect.gen(function* () {
      yield* installFakeHub([]);
      const received: McpReceived[] = [];
      yield* installFakeAgent([], { mcp: { received } });
      yield* createSession('codex-acp', '/w');
      const token = bearerOf(received[0].servers);

      const unknownTool = yield* handleHubToolCall({ args: {}, token, tool: 'launch_missiles' });
      const badArgs = yield* handleHubToolCall({ args: { document: 42 }, token, tool: 'submit_handoff' });
      const stranger = yield* handleHubToolCall({ args: { document: 'x' }, token: 'nope', tool: 'submit_handoff' });
      assert.isTrue(unknownTool.isError && badArgs.isError && stranger.isError);
      assert.include(badArgs.text, 'Invalid arguments');
    }).pipe(Effect.scoped),
  );
});
