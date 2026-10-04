import { assert, describe, it } from '@effect/vitest';
import { Effect, Ref } from 'effect';

import { ADAPTER_AGENT_INFO } from './adapterAgentInfo.ts';
import { makeGeminiAcpAgentHandlerMap } from './agentHandlers.ts';
import type { GeminiChild } from './agentHandlers.ts';

const makeFakeChild = (calls: Ref.Ref<string[]>): GeminiChild => ({
  agent: {
    authenticate: () =>
      Effect.gen(function* () {
        yield* Ref.update(calls, c => [...c, 'authenticate']);
        return {};
      }),
    initialize: () =>
      Effect.gen(function* () {
        yield* Ref.update(calls, c => [...c, 'initialize']);
        return {
          agentCapabilities: {
            loadSession: true,
            promptCapabilities: { image: true },
          },
          agentInfo: { name: 'gemini', title: 'Gemini CLI', version: '9.9.9' },
          authMethods: [{ id: 'google', name: 'Google' }],
          protocolVersion: 1,
        };
      }),
    logout: () =>
      Effect.gen(function* () {
        yield* Ref.update(calls, c => [...c, 'logout']);
        return {};
      }),
    'session/load': request =>
      Effect.gen(function* () {
        yield* Ref.update(calls, c => [...c, `session/load:${request.sessionId}`]);
        return {};
      }),
    'session/new': request =>
      Effect.gen(function* () {
        yield* Ref.update(calls, c => [...c, `session/new:${request.cwd}`]);
        return { sessionId: 'sess-1' };
      }),
    'session/prompt': request =>
      Effect.gen(function* () {
        yield* Ref.update(calls, c => [...c, `session/prompt:${request.sessionId}`]);
        return { stopReason: 'end_turn' };
      }),
    'session/set_config_option': request =>
      Effect.gen(function* () {
        yield* Ref.update(calls, c => [...c, `session/set_config_option:${request.configId}`]);
        return { configOptions: [] };
      }),
    'session/set_mode': request =>
      Effect.gen(function* () {
        yield* Ref.update(calls, c => [...c, `session/set_mode:${request.modeId}`]);
        return {};
      }),
  },
  notify: (tag, payload) =>
    Effect.gen(function* () {
      const sessionId =
        typeof payload === 'object' &&
        payload !== null &&
        'sessionId' in payload &&
        typeof payload.sessionId === 'string'
          ? (payload as { sessionId: string }).sessionId
          : '?';
      yield* Ref.update(calls, c => [...c, `notify:${tag}:${sessionId}`]);
    }),
});

describe('makeGeminiAcpAgentHandlerMap', () => {
  it.effect('rewrites initialize caps and agentInfo', () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make<string[]>([]);
      const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)));

      const result = yield* handlers.initialize({ protocolVersion: 1 });

      assert.deepStrictEqual(result.agentInfo, ADAPTER_AGENT_INFO);
      assert.deepStrictEqual((result.agentCapabilities as { sessionCapabilities: unknown }).sessionCapabilities, {
        close: {},
        delete: {},
        list: {},
        resume: {},
      });
      assert.strictEqual((result.agentCapabilities as { loadSession: unknown }).loadSession, true);
      assert.deepStrictEqual(yield* Ref.get(calls), ['initialize']);
    }),
  );

  it.effect('forwards new/load/prompt/config and stubs list without calling child', () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make<string[]>([]);
      const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)));

      const created = yield* handlers['session/new']({ cwd: '/tmp/proj', mcpServers: [] });
      assert.strictEqual(created.sessionId, 'sess-1');

      yield* handlers['session/load']({
        cwd: '/tmp/proj',
        mcpServers: [],
        sessionId: 'sess-1',
      });
      yield* handlers['session/prompt']({
        prompt: [{ text: 'hi', type: 'text' }],
        sessionId: 'sess-1',
      });
      yield* handlers['session/set_config_option']({
        configId: 'model',
        sessionId: 'sess-1',
        value: 'x',
      });

      const listed = yield* handlers['session/list']();
      assert.deepStrictEqual(listed, { sessions: [] });

      assert.deepStrictEqual(yield* Ref.get(calls), [
        'session/new:/tmp/proj',
        'session/load:sess-1',
        'session/prompt:sess-1',
        'session/set_config_option:model',
      ]);
    }),
  );

  it.effect('stub close/delete/resume do not call child', () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make<string[]>([]);
      const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)));

      yield* handlers['session/close']();
      yield* handlers['session/delete']();
      yield* handlers['session/resume']();

      assert.deepStrictEqual(yield* Ref.get(calls), []);
    }),
  );

  it.effect('forwards session/cancel via child notify', () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make<string[]>([]);
      const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)));

      yield* handlers['session/cancel']({ sessionId: 'sess-1' });

      assert.deepStrictEqual(yield* Ref.get(calls), ['notify:session/cancel:sess-1']);
    }),
  );
});
