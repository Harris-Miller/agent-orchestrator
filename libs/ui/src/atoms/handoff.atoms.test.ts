/**
 * Handoff through its AtomFn, against a real registry, the Harness event fold, fake ACP agents on both launch targets
 * and a fake hub connection. The source agent "calls" `submit_handoff` by handing a tool call to the same handler the
 * hub connection feeds.
 */
import { assert, describe, it } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { handleHubToolCall } from '../host/hubSessions.ts';
import type { HubToolResult } from '../host/hubToolHandler.ts';
import { configValue } from '../host/sessionConfiguration.ts';
import { createSession } from '../host/sessionRpc.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import {
  advertise,
  bearerOf,
  CLAUDE,
  CODEX,
  freshRegistry,
  installFakeAgent,
  installFakeHub,
} from './fakeAgent.testing.ts';
import type { McpReceived } from './fakeAgent.testing.ts';
import { createHandoffAtoms, handoffSourcePrompt, SOURCE_TURN_TIMEOUT } from './handoff.atoms.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';

const submitHandoff = (received: McpReceived[], document: string): Effect.Effect<HubToolResult> =>
  handleHubToolCall({ args: { document }, token: bearerOf(received[0].servers), tool: 'submit_handoff' });

/** A Codex source session `bound-1`, created through the real RPC so it holds a hub credential. */
const sourceSession = Effect.fnUntraced(function* (
  received: McpReceived[],
  opts: Parameters<typeof installFakeAgent>[1],
) {
  const registry = yield* freshRegistry;
  advertise(registry, CODEX, {});
  advertise(registry, CLAUDE, {});
  const sourceCalls: string[] = [];
  yield* installFakeAgent(sourceCalls, { ...opts, mcp: { received } });
  yield* createSession(CODEX, '/w');
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [{ cwd: '/w', sessionId: 'bound-1', title: 'Source' }],
    sessions: { 'bound-1': initialSessionSnapshot('bound-1', 'active') },
  }));
  return { registry, sourceCalls };
});

const handoffArg = {
  configValues: { model: 'o1' },
  sourceLaunchTarget: CODEX,
  sourceSessionId: 'bound-1',
  targetLaunchTarget: CLAUDE,
} as const;

describe('handoffSessionAtomFn', () => {
  it.effect('seeds the target with exactly the submitted document, whatever the agent says afterwards', () =>
    Effect.gen(function* () {
      yield* installFakeHub([]);
      const received: McpReceived[] = [];
      let sourceFold: ReturnType<typeof makeHarnessEventFold> | undefined;
      const { registry, sourceCalls } = yield* sourceSession(received, {
        duringPrompt: Effect.gen(function* () {
          yield* submitHandoff(received, 'the plan');
          // A chattier agent: more text after the tool call must not matter.
          sourceFold?.onSessionUpdate('bound-1', {
            content: { text: 'Done.', type: 'text' },
            sessionUpdate: 'agent_message_chunk',
          });
        }),
      });
      sourceFold = makeHarnessEventFold({
        launchTarget: CODEX,
        registry,
        runFork: () => undefined,
      });
      const targetFold = makeHarnessEventFold({
        launchTarget: CLAUDE,
        registry,
        runFork: () => undefined,
      });
      const targetCalls: string[] = [];
      const seeds: string[] = [];
      yield* installFakeAgent(
        targetCalls,
        {
          duringSetConfig: Effect.sync(() => {
            // A session/update landing during the target Config diffs survives the Handoff.
            targetFold.onSessionUpdate('claude-1', {
              availableCommands: [{ description: 'Review the diff', name: 'review' }],
              sessionUpdate: 'available_commands_update',
            });
          }),
          promptTexts: seeds,
        },
        CLAUDE,
      );
      const { handoffSessionAtomFn } = createHandoffAtoms(createHostRuntime(mockHostLayer));
      registry.mount(handoffSessionAtomFn);

      yield* runAtomFn(registry, handoffSessionAtomFn, handoffArg);

      assert.deepStrictEqual(sourceCalls, ['new', 'prompt:bound-1']);
      assert.deepStrictEqual(targetCalls, ['new:claude', 'set:model:o1', 'prompt:claude-1']);
      assert.strictEqual(seeds.length, 1);
      assert.include(seeds[0], '<handoff>\nthe plan\n</handoff>');
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'claude-1' });
      const target = registry.get(backendHarnessSnapshotAtom(CLAUDE)).sessions['claude-1'];
      assert.strictEqual(configValue(target.configuration, 'model'), 'o1');
      assert.deepStrictEqual(target.availableCommands, [{ description: 'Review the diff', name: 'review' }]);
    }),
  );

  it.effect('fails with HandoffError when the turn ends without submit_handoff, and creates no target', () =>
    Effect.gen(function* () {
      yield* installFakeHub([]);
      const received: McpReceived[] = [];
      const { registry } = yield* sourceSession(received, {});
      const targetCalls: string[] = [];
      yield* installFakeAgent(targetCalls, {}, CLAUDE);
      const { handoffSessionAtomFn } = createHandoffAtoms(createHostRuntime(mockHostLayer));
      registry.mount(handoffSessionAtomFn);

      const exit = yield* Effect.exit(runAtomFn(registry, handoffSessionAtomFn, handoffArg));

      assert.strictEqual(exit._tag, 'Failure');
      assert.deepStrictEqual(targetCalls, []);
    }),
  );

  it.effect('cancels the source turn and fails when the agent never finishes it', () =>
    Effect.gen(function* () {
      yield* installFakeHub([]);
      const { registry, sourceCalls } = yield* sourceSession([], { duringPrompt: Effect.never });
      const run = yield* Effect.forkChild(
        handoffSourcePrompt(registry, CODEX, 'bound-1').pipe(Effect.provide(mockHostLayer)),
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust(SOURCE_TURN_TIMEOUT);

      const exit = yield* Effect.exit(Fiber.join(run));

      assert.strictEqual(exit._tag, 'Failure');
      assert.include(sourceCalls, 'cancel:bound-1');
    }),
  );

  it.effect('is unavailable, without prompting the source, when the source session has no hub credential', () =>
    Effect.gen(function* () {
      // No hub installed: the session is created without an MCP server.
      const received: McpReceived[] = [];
      const { registry, sourceCalls } = yield* sourceSession(received, {});
      const { handoffSessionAtomFn } = createHandoffAtoms(createHostRuntime(mockHostLayer));
      registry.mount(handoffSessionAtomFn);

      const exit = yield* Effect.exit(runAtomFn(registry, handoffSessionAtomFn, handoffArg));

      assert.strictEqual(exit._tag, 'Failure');
      assert.deepStrictEqual(received[0].servers, []);
      assert.deepStrictEqual(sourceCalls, ['new']);
    }),
  );

  it.effect('returns a tool error for submit_handoff when no Handoff is pending', () =>
    Effect.gen(function* () {
      yield* installFakeHub([]);
      const received: McpReceived[] = [];
      yield* sourceSession(received, {});

      const result = yield* submitHandoff(received, 'unsolicited');

      assert.isTrue(result.isError);
    }),
  );
});
