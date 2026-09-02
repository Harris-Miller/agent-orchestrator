import { NodeChildProcessSpawner, NodeFileSystem } from '@effect/platform-node';
import { assert, describe, it } from '@effect/vitest';
import { Effect, Layer, Path } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ClientRpcs } from '@libs/effect-acp';

import { connectAcpAgent } from './AcpConnection.ts';

const echoMain = path.join(fileURLToPath(new URL('../../../apps/jsonrpc-echo/src/main.ts', import.meta.url)));

const echoCommand = ChildProcess.make('bun', ['run', echoMain], {
  extendEnv: true,
  stderr: 'inherit',
  stdin: 'pipe',
  stdout: 'pipe',
});

const TestLayer = NodeChildProcessSpawner.layer.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, Path.layer)));

const stubClientHandlers = (sessionUpdates: { sessionId: string; update: unknown }[]) =>
  ClientRpcs.toLayer(
    Effect.succeed({
      'elicitation/complete': () => Effect.void,
      'elicitation/create': () => Effect.succeed({}),
      'fs/read_text_file': () => Effect.succeed({ content: '' }),
      'fs/write_text_file': () => Effect.succeed({}),
      'session/request_permission': () => Effect.succeed({ outcome: { outcome: 'cancelled' as const } }),
      'session/update': payload =>
        Effect.sync(() => {
          sessionUpdates.push({ sessionId: payload.sessionId, update: payload.update });
        }),
      'terminal/create': () => Effect.succeed({ terminalId: 'stub-terminal' }),
      'terminal/kill': () => Effect.succeed({}),
      'terminal/output': () => Effect.succeed({ output: '', truncated: false }),
      'terminal/release': () => Effect.succeed({}),
      'terminal/wait_for_exit': () => Effect.succeed({ exitCode: 0, signal: null }),
    }),
  );

describe('connectAcpAgent', () => {
  it.effect('calls jsonrpc-echo over stdio', () =>
    Effect.gen(function* () {
      const sessionUpdates: { sessionId: string; update: unknown }[] = [];
      const { agent } = yield* connectAcpAgent(echoCommand, stubClientHandlers(sessionUpdates));

      yield* agent.initialize({ protocolVersion: 1 });
      const session = yield* agent['session/new']({ cwd: '.', mcpServers: [] });

      assert.strictEqual(sessionUpdates.length, 1);
      assert.strictEqual(sessionUpdates[0]?.sessionId, session.sessionId);
      assert.strictEqual(
        (sessionUpdates[0]?.update as { sessionUpdate: string }).sessionUpdate,
        'available_commands_update',
      );

      const simpleReply = yield* agent['session/prompt']({
        prompt: [{ text: 'hi', type: 'text' }],
        sessionId: session.sessionId,
      });

      assert.strictEqual(simpleReply.stopReason, 'end_turn');
      assert.match(session.sessionId, /^[0-9a-f-]{36}$/);
      assert.strictEqual(sessionUpdates.length, 2);
      assert.strictEqual(sessionUpdates[1]?.sessionId, session.sessionId);
      assert.deepStrictEqual(sessionUpdates[1]?.update, {
        content: { text: 'hi', type: 'text' },
        messageId: 'msg_simple_1',
        sessionUpdate: 'agent_message_chunk',
      });

      const toolTurn = yield* agent['session/prompt']({
        prompt: [{ text: '/fixture tool-turn', type: 'text' }],
        sessionId: session.sessionId,
      });

      assert.strictEqual(toolTurn.stopReason, 'end_turn');
      assert.strictEqual(sessionUpdates.length, 8);
      assert.strictEqual((sessionUpdates[2]?.update as { sessionUpdate: string }).sessionUpdate, 'plan');
      assert.strictEqual((sessionUpdates[4]?.update as { sessionUpdate: string }).sessionUpdate, 'tool_call');
      assert.strictEqual((sessionUpdates[7]?.update as { sessionUpdate: string }).sessionUpdate, 'agent_message_chunk');
    }).pipe(Effect.scoped, Effect.provide(TestLayer)),
  );

  it.effect('spawns twice sequentially', () =>
    Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const { handle } = yield* connectAcpAgent(echoCommand, stubClientHandlers([]));
        yield* handle.kill();
      }).pipe(Effect.scoped, Effect.provide(TestLayer));

      yield* Effect.gen(function* () {
        const { handle } = yield* connectAcpAgent(echoCommand, stubClientHandlers([]));
        yield* handle.kill();
      }).pipe(Effect.scoped, Effect.provide(TestLayer));
    }),
  );

  it.effect('initializes twice sequentially', () =>
    Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const { agent, handle } = yield* connectAcpAgent(echoCommand, stubClientHandlers([]));
        yield* agent.initialize({ protocolVersion: 1 });
        yield* handle.kill();
      }).pipe(Effect.scoped, Effect.provide(TestLayer));

      yield* Effect.gen(function* () {
        const { agent, handle } = yield* connectAcpAgent(echoCommand, stubClientHandlers([]));
        yield* agent.initialize({ protocolVersion: 1 });
        yield* handle.kill();
      }).pipe(Effect.scoped, Effect.provide(TestLayer));
    }),
  );

  it.effect('connects once', () =>
    Effect.gen(function* () {
      const sessionId = yield* Effect.gen(function* () {
        const { agent, handle } = yield* connectAcpAgent(echoCommand, stubClientHandlers([]));
        yield* agent.initialize({ protocolVersion: 1 });
        const session = yield* agent['session/new']({ cwd: '.', mcpServers: [] });
        yield* handle.kill();
        return session.sessionId;
      }).pipe(Effect.scoped, Effect.provide(TestLayer));

      assert.match(sessionId, /^[0-9a-f-]{36}$/);
    }),
  );

  it.effect('reconnects across separate scoped runs', () =>
    Effect.gen(function* () {
      const runOnce = () =>
        Effect.gen(function* () {
          const { agent } = yield* connectAcpAgent(echoCommand, stubClientHandlers([]));
          yield* agent.initialize({ protocolVersion: 1 });
          const session = yield* agent['session/new']({ cwd: '.', mcpServers: [] });
          return session.sessionId;
        }).pipe(Effect.scoped, Effect.provide(TestLayer));

      const firstSessionId = yield* runOnce();
      const secondSessionId = yield* runOnce();
      assert.match(firstSessionId, /^[0-9a-f-]{36}$/);
      assert.match(secondSessionId, /^[0-9a-f-]{36}$/);
    }),
  );
});
