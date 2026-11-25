/**
 * End to end across the real pieces: a real hub on a free port, the real hub client (health probe, discovery file,
 * WebSocket), a fake agent, and raw MCP-over-HTTP standing in for the agent's tool call. `it.live`: real sockets and
 * timers, which the TestClock would stall.
 */
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { assert, describe, it } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { runHubProcess, startHub as startHubServer } from '@lib/hub';
import { PROTOCOL_VERSION } from '@lib/hub/protocol';
import { mcpCallTool, mcpInitialize } from '@lib/hub/testing';
import { Deferred, Effect, Exit, Layer, Option, Scope, Tracer } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { pid as hubPid } from 'node:process';
import { join } from 'node:path';
import { ACP_PARENT_SESSION_ID, ACP_SESSION_ID } from '@lib/hub/telemetryKeys';

import { bearerOf, installFakeAgent } from '../atoms/fakeAgent.testing.ts';
import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';
import type { McpReceived } from '../atoms/fakeAgent.testing.ts';

import { expectHandoff } from './handoffSubmission.ts';
import { HubUnavailable, runHubClient } from './hubClient.ts';
import { onHubAvailability, setHubAvailability } from './hubConnection.ts';
import type { HubAvailability } from './hubConnection.ts';
import { forgetAllMcpTokens } from './hubSessions.ts';
import { createSession } from './sessionRpc.ts';

/** A port nothing listens on right now. */
const freePort = Effect.promise(
  () =>
    new Promise<number>(resolve => {
      const server = createServer();
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        server.close(() => {
          resolve(port);
        });
      });
    }),
);

/** A temp OS home; the hub writes `<home>/.hoa/hub.json` and the client reads it from there. */
const homeLayer = (home: string) =>
  Layer.mergeAll(
    mockHostLayer,
    NodeFileSystem.layer,
    NodePath.layer,
    Layer.succeed(OS, {
      arch: () => 'arm64',
      cwd: () => home,
      env: () => ({}),
      homedir: () => home,
      platform: () => platform(),
    }),
  );

/** Run a hub process (discovery file included) in its own scope; close the scope to stop it. */
const startHubIn = (home: string, port: number) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    yield* runHubProcess({ home: join(home, '.hoa'), idleGrace: '10 seconds', port }).pipe(Scope.provide(scope));
    return scope;
  });

const waitFor = (predicate: (availability: HubAvailability) => boolean) =>
  Effect.callback<HubAvailability>(resume => {
    const unsubscribe = onHubAvailability(next => {
      if (predicate(next)) {
        resume(Effect.succeed(next));
      }
    });
    return Effect.sync(unsubscribe);
  }).pipe(Effect.timeout('8 seconds'));

const isAvailable = (availability: HubAvailability) => availability._tag === 'available';

/** Create a Codex session through the real RPC; the agent's view of its hub credential. */
const sessionWithCredential = (parentSessionId?: string) =>
  Effect.gen(function* () {
    const received: McpReceived[] = [];
    yield* installFakeAgent([], { mcp: { received } });
    const { result } = yield* createSession('codex-acp', '/w', { parentSessionId });
    const [server] = received[0].servers as readonly { url: string }[];
    return { sessionId: result.sessionId, token: bearerOf(received[0].servers), url: server.url };
  });

/** The agent calls `submit_handoff` over MCP while a Handoff waits; resolves to the document the Harness received. */
const agentSubmitsHandoff = (url: string, token: string, sessionId: string, document: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const waiting = yield* expectHandoff('codex-acp', sessionId);
      const { sessionId: mcpSession } = yield* mcpInitialize(url, token);
      const result = yield* mcpCallTool(url, token, mcpSession, 'submit_handoff', { document });
      assert.isFalse(result.isError ?? false);
      return yield* Deferred.await(waiting);
    }),
  );

const reset = Effect.sync(() => {
  forgetAllMcpTokens();
  setHubAvailability({ _tag: 'unavailable', reason: 'No hub in this test.' });
});

const registry = AtomRegistry.make();

describe('hub client + hub', () => {
  it.live('starts a hub when none answers, then routes an agent tool call to the owning session', () => {
    const home = mkdtempSync(join(tmpdir(), 'hoa-e2e-'));
    return Effect.gen(function* () {
      yield* Effect.addFinalizer(() => reset);
      const port = yield* freePort;
      let hub: Scope.Closeable | undefined;
      yield* Effect.addFinalizer(() => (hub === undefined ? Effect.void : Scope.close(hub, Exit.void)));
      // Stands in for the launcher: starts a hub process (bind + discovery file) when the client finds none.
      const startHub = Effect.gen(function* () {
        hub = yield* startHubIn(home, port);
      }).pipe(Effect.mapError(() => new HubUnavailable({ reason: 'start failed' })));

      yield* Effect.forkScoped(runHubClient({ clientKind: 'test', port, registry, startHub }));
      yield* waitFor(isAvailable);

      const { sessionId, token, url } = yield* sessionWithCredential();
      assert.strictEqual(url, `http://127.0.0.1:${port}/mcp`);
      assert.strictEqual(yield* agentSubmitsHandoff(url, token, sessionId, 'end to end plan'), 'end to end plan');
    }).pipe(Effect.scoped, Effect.provide(homeLayer(home)));
  });

  it.live('the Harness handles a routed tool call as a child of the hub.toolCall span: one trace', () => {
    const home = mkdtempSync(join(tmpdir(), 'hoa-e2e-'));
    // Hub and Harness run in this process, so one tracer sees both sides.
    const spans: Tracer.NativeSpan[] = [];
    const tracerLive = Layer.succeed(
      Tracer.Tracer,
      Tracer.make({
        span: options => {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      }),
    );
    return Effect.gen(function* () {
      yield* Effect.addFinalizer(() => reset);
      const port = yield* freePort;
      const hub = yield* startHubIn(home, port);
      yield* Effect.addFinalizer(() => Scope.close(hub, Exit.void));
      const startHub = Effect.fail(new HubUnavailable({ reason: 'already running' }));
      yield* Effect.forkScoped(runHubClient({ clientKind: 'test', port, registry, startHub }));
      yield* waitFor(isAvailable);
      const { sessionId, token, url } = yield* sessionWithCredential();
      yield* agentSubmitsHandoff(url, token, sessionId, 'traced');

      const hubCall = spans.find(span => span.name === 'hub.toolCall');
      const handled = spans.find(span => span.name === 'hub.handleToolCall');
      assert.isDefined(hubCall);
      assert.isDefined(handled);
      assert.strictEqual(handled?.traceId, hubCall?.traceId);
      assert.strictEqual(Option.getOrUndefined(handled?.parent ?? Option.none())?.spanId, hubCall?.spanId);
      assert.strictEqual(handled?.attributes.get('hub.tool'), 'submit_handoff');
    }).pipe(Effect.scoped, Effect.provide(homeLayer(home)), Effect.provide(tracerLive));
  });

  it.live('survives a hub restart: existing credentials are re-registered and route again', () => {
    const home = mkdtempSync(join(tmpdir(), 'hoa-e2e-'));
    // The hub runs in this process, so its spans land here: a Spawned subagent session's parent must survive the restart.
    const hubSpans: Tracer.NativeSpan[] = [];
    const tracerLive = Layer.succeed(
      Tracer.Tracer,
      Tracer.make({
        span: options => {
          const span = new Tracer.NativeSpan(options);
          hubSpans.push(span);
          return span;
        },
      }),
    );
    return Effect.gen(function* () {
      yield* Effect.addFinalizer(() => reset);
      const port = yield* freePort;
      let hub = yield* startHubIn(home, port);
      yield* Effect.addFinalizer(() => Scope.close(hub, Exit.void));
      const startHub = Effect.gen(function* () {
        hub = yield* startHubIn(home, port);
      }).pipe(Effect.mapError(() => new HubUnavailable({ reason: 'start failed' })));

      yield* Effect.forkScoped(runHubClient({ clientKind: 'test', port, registry, startHub }));
      yield* waitFor(isAvailable);
      const { sessionId, token, url } = yield* sessionWithCredential('parent-1');

      // The hub dies; the client notices, starts a new one on the same port and re-registers the session's token.
      const seen: HubAvailability['_tag'][] = [];
      yield* Effect.acquireRelease(
        Effect.sync(() => onHubAvailability(next => seen.push(next._tag))),
        unsubscribe => Effect.sync(unsubscribe),
      );
      yield* Scope.close(hub, Exit.void);
      yield* Effect.sleep('50 millis').pipe(
        Effect.repeat({ until: () => seen.includes('connecting') && seen.at(-1) === 'available' }),
        Effect.timeout('8 seconds'),
      );

      assert.strictEqual(yield* agentSubmitsHandoff(url, token, sessionId, 'after restart'), 'after restart');
      const restartedCall = hubSpans.filter(span => span.name === 'hub.toolCall').at(-1);
      assert.strictEqual(restartedCall?.attributes.get(ACP_SESSION_ID), sessionId);
      assert.strictEqual(restartedCall?.attributes.get(ACP_PARENT_SESSION_ID), 'parent-1');
    }).pipe(Effect.scoped, Effect.provide(homeLayer(home)), Effect.provide(tracerLive));
  });

  it.live("ignores a crashed hub's leftover discovery file and connects to the hub it started", () => {
    const home = mkdtempSync(join(tmpdir(), 'hoa-e2e-'));
    return Effect.gen(function* () {
      yield* Effect.addFinalizer(() => reset);
      const port = yield* freePort;
      // What a SIGKILLed hub leaves behind: same fixed port, a dead pid, a secret no live hub accepts.
      mkdirSync(join(home, '.hoa'), { recursive: true });
      writeFileSync(
        join(home, '.hoa', 'hub.json'),
        JSON.stringify({ pid: 999_999, port, protocolVersion: PROTOCOL_VERSION, secret: 'dead' }),
      );
      // A detached hub answers /health as soon as it binds, a moment before it publishes its own discovery file.
      const testScope = yield* Effect.scope;
      const startHub = Effect.gen(function* () {
        yield* startHubServer({ idleGrace: '10 seconds', port, secret: 'live' });
        yield* Effect.forkIn(
          Effect.andThen(
            Effect.sleep('500 millis'),
            Effect.sync(() => {
              writeFileSync(
                join(home, '.hoa', 'hub.json'),
                JSON.stringify({ pid: hubPid, port, protocolVersion: PROTOCOL_VERSION, secret: 'live' }),
              );
            }),
          ),
          testScope,
        );
      }).pipe(
        Scope.provide(testScope),
        Effect.mapError(() => new HubUnavailable({ reason: 'start failed' })),
      );
      const seen: HubAvailability['_tag'][] = [];
      yield* Effect.acquireRelease(
        Effect.sync(() => onHubAvailability(next => seen.push(next._tag))),
        unsubscribe => Effect.sync(unsubscribe),
      );

      yield* Effect.forkScoped(runHubClient({ clientKind: 'test', port, registry, startHub }));
      yield* waitFor(isAvailable);
      assert.notInclude(seen, 'unavailable');
    }).pipe(Effect.scoped, Effect.provide(homeLayer(home)));
  });

  it.live('degrades with a reason when another program holds the port', () =>
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() => reset);
      const port = yield* freePort;
      const squatter = createServer((_request, response) => {
        response.end('not a hub');
      });
      yield* Effect.acquireRelease(
        Effect.promise(
          () =>
            new Promise<void>(resolve => {
              squatter.listen(port, '127.0.0.1', resolve);
            }),
        ),
        () =>
          Effect.promise(
            () =>
              new Promise<void>(resolve => {
                squatter.close(() => {
                  resolve();
                });
              }),
          ),
      );
      const startHub = Effect.fail(new HubUnavailable({ reason: 'must not be started' }));

      yield* Effect.forkScoped(runHubClient({ clientKind: 'test', port, registry, startHub }));
      const degraded = yield* waitFor(availability => availability._tag === 'unavailable');
      assert.include(degraded._tag === 'unavailable' ? degraded.reason : '', `port ${port}`);
    }).pipe(Effect.scoped, Effect.provide(homeLayer(mkdtempSync(join(tmpdir(), 'hoa-e2e-'))))),
  );

  it.live("degrades with the launcher's reason when no hub can be started", () =>
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() => reset);
      const port = yield* freePort;
      const startHub = Effect.fail(new HubUnavailable({ reason: 'Node.js was not found on PATH.' }));

      yield* Effect.forkScoped(runHubClient({ clientKind: 'test', port, registry, startHub }));
      const degraded = yield* waitFor(availability => availability._tag === 'unavailable');
      assert.deepStrictEqual(degraded, { _tag: 'unavailable', reason: 'Node.js was not found on PATH.' });
    }).pipe(Effect.scoped, Effect.provide(homeLayer(mkdtempSync(join(tmpdir(), 'hoa-e2e-'))))),
  );
});
