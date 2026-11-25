/** Which session RPCs inject the hub as an MCP server, and the credential lifecycle behind it. */
import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Fiber, Scope } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import { TestClock } from 'effect/testing';

import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';
import { bearerOf, CLAUDE, CODEX, installFakeAgent, installFakeHub } from '../atoms/fakeAgent.testing.ts';
import type { McpReceived } from '../atoms/fakeAgent.testing.ts';

import { setHubAvailability } from './hubConnection.ts';
import {
  beginMcp,
  handleHubToolCall as callHubTool,
  currentHubUnavailableReason,
  registeredTokens,
} from './hubSessions.ts';
import type { HubToolCall } from './hubSessions.ts';
import { closeSession, createSession, deleteSession, forkSession, loadSession, resumeSession } from './sessionRpc.ts';

/** A tool call with a throwaway registry and mock Host services (these handlers need neither). */
const handleHubToolCall = (call: HubToolCall) =>
  callHubTool(call, { registry: AtomRegistry.make() }).pipe(Effect.provide(mockHostLayer));

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
    }),
  );

  it.effect('a Spawned subagent session binds with its parent session, and keeps it for a hub restart', () =>
    Effect.gen(function* () {
      const hubCalls: string[] = [];
      yield* installFakeHub(hubCalls);
      yield* installFakeAgent([], { mcp: { received: [] } });

      yield* createSession('codex-acp', '/w', { parentSessionId: 'parent-1' });

      assert.deepStrictEqual(hubCalls, ['register', 'bind:codex-acp:bound-1:parent=parent-1']);
      assert.deepStrictEqual(
        registeredTokens().map(({ parentSessionId, sessionId }) => [sessionId, parentSessionId]),
        [['bound-1', 'parent-1']],
      );
    }),
  );

  it.effect('pre-approves the hub tools for Claude, so a Handoff never stops on a permission prompt', () =>
    Effect.gen(function* () {
      yield* installFakeHub([]);
      const received: McpReceived[] = [];
      yield* installFakeAgent([], { mcp: { received } }, CLAUDE);
      yield* installFakeAgent([], { mcp: { received } }, CODEX);

      yield* createSession(CLAUDE, '/w');
      yield* loadSession(CLAUDE, 's1', '/w');
      yield* resumeSession(CLAUDE, 's2', '/w');
      yield* forkSession(CLAUDE, 's3', '/w');
      yield* createSession(CODEX, '/w');

      const preapproved = {
        claudeCode: {
          options: {
            allowedTools: [
              'mcp__hoa-hub__submit_handoff',
              'mcp__hoa-hub__list_subagent_targets',
              'mcp__hoa-hub__spawn_subagent',
              'mcp__hoa-hub__cancel_subagent',
              'mcp__hoa-hub__wait_subagent',
            ],
          },
        },
      };
      assert.deepStrictEqual(
        received.map(r => r.meta),
        [preapproved, preapproved, preapproved, preapproved, undefined],
      );
    }),
  );

  it.effect('sends Claude no pre-approval when the hub is not injected', () =>
    Effect.gen(function* () {
      const received: McpReceived[] = [];
      yield* installFakeAgent([], { mcp: { http: false, received } }, CLAUDE);
      yield* createSession(CLAUDE, '/w');
      assert.strictEqual(received[0].meta, undefined);
    }),
  );

  it.effect('injects nothing when the hub is unavailable or the agent lacks HTTP MCP', () =>
    Effect.gen(function* () {
      const received: McpReceived[] = [];
      // Agent supports HTTP MCP, but there is no hub.
      yield* installFakeAgent([], { mcp: { received } });
      yield* createSession('codex-acp', '/w');
      assert.deepStrictEqual(received[0].servers, []);
    }),
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
    }),
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
    }),
  );

  it.effect('re-issuing on load revokes the previous credential for that session', () =>
    Effect.gen(function* () {
      const hubCalls: string[] = [];
      yield* installFakeHub(hubCalls);
      yield* installFakeAgent([], { mcp: { received: [] } });
      yield* loadSession('codex-acp', 's1', '/w');
      yield* loadSession('codex-acp', 's1', '/w');
      assert.strictEqual(hubCalls.filter(call => call === 'revoke').length, 1);
    }),
  );

  it.effect('a load that gets no hub still revokes the session’s previous credential', () =>
    Effect.gen(function* () {
      const hubCalls: string[] = [];
      yield* installFakeHub(hubCalls);
      const first = yield* beginMcp('codex-acp', true);
      yield* first.bind('s1');
      const second = yield* beginMcp('codex-acp', false);
      yield* second.bind('s1');
      assert.strictEqual(hubCalls.filter(call => call === 'revoke').length, 1);
      assert.isDefined(currentHubUnavailableReason('codex-acp', 's1'));
    }),
  );

  it.effect('a credential the hub did not confirm is revoked, in case it lands late', () =>
    Effect.gen(function* () {
      const hubCalls: string[] = [];
      yield* installFakeHub(hubCalls, { accept: false });
      yield* beginMcp('codex-acp', true);
      assert.deepStrictEqual(hubCalls, ['register', 'revoke']);
    }),
  );

  it.effect('a session RPC started while the hub is still connecting waits for it (startup Bind race)', () =>
    Effect.gen(function* () {
      setHubAvailability({ _tag: 'connecting' });
      const received: McpReceived[] = [];
      yield* installFakeAgent([], { mcp: { received } });
      const create = yield* Effect.forkChild(createSession('codex-acp', '/w'));
      yield* TestClock.adjust('1 second');
      yield* installFakeHub([]);
      yield* Fiber.join(create);
      assert.strictEqual(received[0].servers.length, 1);
      assert.strictEqual(currentHubUnavailableReason('codex-acp', 'bound-1'), undefined);
    }),
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
    }),
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
    }),
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
    }),
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
    }),
  );

  it.effect('rejects a blank handoff document', () =>
    Effect.gen(function* () {
      yield* installFakeHub([]);
      const received: McpReceived[] = [];
      yield* installFakeAgent([], { mcp: { received } });
      yield* createSession('codex-acp', '/w');

      const blank = yield* handleHubToolCall({
        args: { document: ' \n ' },
        token: bearerOf(received[0].servers),
        tool: 'submit_handoff',
      });

      assert.isTrue(blank.isError);
      assert.include(blank.text, 'must not be empty');
    }),
  );
});
