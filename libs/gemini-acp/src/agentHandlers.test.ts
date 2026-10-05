import { assert, describe, layer } from '@effect/vitest';
import { mapFsTestServices } from '@lib/ao-home/testing';
import type { MapFsEntry } from '@lib/ao-home/testing';
import { Cause, Effect, Exit, Ref } from 'effect';
import { beforeEach } from 'vitest';

import { ADAPTER_AGENT_INFO } from './adapterAgentInfo.ts';
import { makeGeminiAcpAgentHandlerMap } from './agentHandlers.ts';
import type { GeminiChild } from './geminiChild.ts';
import { isLoaded, makeLoadedSet } from './loadedSet.ts';
import { makeSessionConfigStore } from './sessionConfigStore.ts';

const geminiModels = {
  availableModels: [
    { modelId: 'auto-gemini-2.5', name: 'Auto' },
    { modelId: 'gemini-2.5-pro', name: 'Pro' },
  ],
  currentModelId: 'auto-gemini-2.5',
};

const geminiModes = {
  availableModes: [
    { id: 'default', name: 'Default' },
    { id: 'yolo', name: 'YOLO' },
  ],
  currentModeId: 'default',
};

const makeFakeChild = (calls: Ref.Ref<string[]>): GeminiChild =>
  ({
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
      'session/load': (request: { readonly mcpServers: unknown; readonly sessionId: string }) =>
        Effect.gen(function* () {
          yield* Ref.update(calls, c => [
            ...c,
            `session/load:${request.sessionId}:mcp=${JSON.stringify(request.mcpServers)}`,
          ]);
          return { models: geminiModels, modes: geminiModes };
        }),
      'session/new': (request: { readonly cwd: string }) =>
        Effect.gen(function* () {
          yield* Ref.update(calls, c => [...c, `session/new:${request.cwd}`]);
          return { models: geminiModels, modes: geminiModes, sessionId: 'sess-1' };
        }),
      'session/prompt': (request: { readonly sessionId: string }) =>
        Effect.gen(function* () {
          yield* Ref.update(calls, c => [...c, `session/prompt:${request.sessionId}`]);
          return { stopReason: 'end_turn' };
        }),
      'session/set_config_option': (request: { readonly configId: string }) =>
        Effect.gen(function* () {
          yield* Ref.update(calls, c => [...c, `session/set_config_option:${request.configId}`]);
          return { configOptions: [] };
        }),
      'session/set_mode': (request: { readonly modeId: string }) =>
        Effect.gen(function* () {
          yield* Ref.update(calls, c => [...c, `session/set_mode:${request.modeId}`]);
          return {};
        }),
    },
    notify: (tag: string, payload: unknown) =>
      Effect.gen(function* () {
        const sessionId =
          typeof payload === 'object' &&
          payload !== null &&
          'sessionId' in payload &&
          typeof payload.sessionId === 'string'
            ? payload.sessionId
            : '?';
        yield* Ref.update(calls, c => [...c, `notify:${tag}:${sessionId}`]);
      }),
    sessionSetModel: (request: { readonly modelId: string }) =>
      Effect.gen(function* () {
        yield* Ref.update(calls, c => [...c, `session/set_model:${request.modelId}`]);
        return {};
      }),
  }) as GeminiChild;

describe('makeGeminiAcpAgentHandlerMap', () => {
  const store = new Map<string, MapFsEntry>();

  beforeEach(() => {
    store.clear();
  });

  layer(mapFsTestServices(store))(layeredIt => {
    const makeHandlers = (calls: Ref.Ref<string[]>) =>
      Effect.gen(function* () {
        const loaded = yield* makeLoadedSet();
        const configs = yield* makeSessionConfigStore();
        return {
          configs,
          handlers: makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded, configs),
          loaded,
        };
      });

    layeredIt.effect('rewrites initialize caps and agentInfo', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers } = yield* makeHandlers(calls);

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

    layeredIt.effect('rewrites session/new models into configOptions and maps model set to session/set_model', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers, loaded } = yield* makeHandlers(calls);

        const created = yield* handlers['session/new']({ cwd: '/tmp/proj', mcpServers: [] });
        assert.strictEqual(created.sessionId, 'sess-1');
        assert.strictEqual('models' in created, false);
        const options = created.configOptions as readonly { currentValue?: string; id?: string }[];
        assert.isTrue(options.some(option => option.id === 'model' && option.currentValue === 'auto-gemini-2.5'));
        assert.isTrue(yield* isLoaded(loaded, 'sess-1'));

        yield* handlers['session/prompt']({
          prompt: [{ text: 'hi', type: 'text' }],
          sessionId: 'sess-1',
        });
        const setModel = yield* handlers['session/set_config_option']({
          configId: 'model',
          sessionId: 'sess-1',
          value: 'gemini-2.5-pro',
        });
        const modelOption = (setModel.configOptions as readonly { currentValue?: string; id?: string }[]).find(
          option => option.id === 'model',
        );
        assert.strictEqual(modelOption?.currentValue, 'gemini-2.5-pro');

        const listed = yield* handlers['session/list']({});
        assert.strictEqual(listed.sessions.length, 1);
        assert.strictEqual(listed.sessions[0]?.sessionId, 'sess-1');
        assert.strictEqual(listed.sessions[0]?.cwd, '/tmp/proj');
        assert.isString(listed.sessions[0]?.updatedAt);

        assert.deepStrictEqual(yield* Ref.get(calls), [
          'session/new:/tmp/proj',
          'session/prompt:sess-1',
          'session/set_model:gemini-2.5-pro',
        ]);
      }),
    );

    layeredIt.effect('list filters by cwd when provided', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers } = yield* makeHandlers(calls);

        yield* handlers['session/new']({ cwd: '/tmp/a', mcpServers: [] });
        yield* handlers['session/load']({
          cwd: '/tmp/b',
          mcpServers: [],
          sessionId: 'sess-other',
        });

        const all = yield* handlers['session/list']({});
        assert.strictEqual(all.sessions.length, 2);

        const filtered = yield* handlers['session/list']({ cwd: '/tmp/b' });
        assert.strictEqual(filtered.sessions.length, 1);
        assert.strictEqual(filtered.sessions[0]?.sessionId, 'sess-other');
      }),
    );

    layeredIt.effect('soft close cancels when loaded, keeps roster row, refreshes updatedAt', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers, loaded } = yield* makeHandlers(calls);

        yield* handlers['session/new']({ cwd: '/tmp/proj', mcpServers: [] });
        const rosterPath = '/home/operator/.ao/adapters/gemini-acp/roster.json';
        const onDisk = store.get(rosterPath);
        assert.isTrue(onDisk?.kind === 'file');
        if (onDisk?.kind === 'file') {
          const doc = JSON.parse(onDisk.content) as {
            sessions: { sessionId: string; updatedAt?: string }[];
          };
          doc.sessions[0] = { ...doc.sessions[0], updatedAt: '2020-01-01T00:00:00.000Z' };
          store.set(rosterPath, { content: `${JSON.stringify(doc, null, 2)}\n`, kind: 'file' });
        }
        yield* Ref.set(calls, []);

        yield* handlers['session/close']({ sessionId: 'sess-1' });
        assert.isFalse(yield* isLoaded(loaded, 'sess-1'));
        assert.deepStrictEqual(yield* Ref.get(calls), ['notify:session/cancel:sess-1']);

        const listed = yield* handlers['session/list']({});
        assert.strictEqual(listed.sessions.length, 1);
        assert.notStrictEqual(listed.sessions[0]?.updatedAt, '2020-01-01T00:00:00.000Z');

        yield* Ref.set(calls, []);
        yield* handlers['session/close']({ sessionId: 'sess-1' });
        assert.deepStrictEqual(yield* Ref.get(calls), []);
      }),
    );

    layeredIt.effect('soft delete removes roster entry and drops loaded mark', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers, loaded } = yield* makeHandlers(calls);

        yield* handlers['session/new']({ cwd: '/tmp/proj', mcpServers: [] });
        yield* handlers['session/delete']({ sessionId: 'sess-1' });

        assert.isFalse(yield* isLoaded(loaded, 'sess-1'));
        const listed = yield* handlers['session/list']({});
        assert.deepStrictEqual(listed.sessions, []);
        assert.deepStrictEqual(yield* Ref.get(calls), ['session/new:/tmp/proj']);
      }),
    );

    layeredIt.effect('roster survives adapter restart (empty loaded set)', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers: handlers1 } = yield* makeHandlers(calls);
        yield* handlers1['session/new']({ cwd: '/tmp/proj', mcpServers: [] });

        const loaded2 = yield* makeLoadedSet();
        const configs2 = yield* makeSessionConfigStore();
        const handlers2 = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded2, configs2);
        assert.isFalse(yield* isLoaded(loaded2, 'sess-1'));

        const listed = yield* handlers2['session/list']({});
        assert.strictEqual(listed.sessions.length, 1);
        assert.strictEqual(listed.sessions[0]?.sessionId, 'sess-1');
      }),
    );

    layeredIt.effect('hot resume skips child load; cold resume maps to session/load with configOptions', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers, loaded } = yield* makeHandlers(calls);

        yield* handlers['session/new']({ cwd: '/tmp/proj', mcpServers: [] });
        yield* Ref.set(calls, []);

        const hot = yield* handlers['session/resume']({ cwd: '/tmp/proj', sessionId: 'sess-1' });
        assert.deepStrictEqual(hot, {});
        assert.deepStrictEqual(yield* Ref.get(calls), []);

        yield* handlers['session/close']({ sessionId: 'sess-1' });
        yield* Ref.set(calls, []);

        const cold = yield* handlers['session/resume']({ cwd: '/tmp/proj', sessionId: 'sess-1' });
        const coldOptions = cold.configOptions as readonly { id?: string }[];
        assert.isTrue(coldOptions.some(option => option.id === 'model'));
        assert.isTrue(yield* isLoaded(loaded, 'sess-1'));
        assert.deepStrictEqual(yield* Ref.get(calls), ['session/load:sess-1:mcp=[]']);
      }),
    );

    layeredIt.effect('cold resume after restart loads with empty mcpServers', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers: handlers1 } = yield* makeHandlers(calls);
        yield* handlers1['session/new']({ cwd: '/tmp/proj', mcpServers: [] });

        const loaded2 = yield* makeLoadedSet();
        const configs2 = yield* makeSessionConfigStore();
        const handlers2 = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded2, configs2);
        yield* Ref.set(calls, []);

        yield* handlers2['session/resume']({ cwd: '/tmp/proj', sessionId: 'sess-1' });
        assert.isTrue(yield* isLoaded(loaded2, 'sess-1'));
        assert.deepStrictEqual(yield* Ref.get(calls), ['session/load:sess-1:mcp=[]']);
      }),
    );

    layeredIt.effect('forwards session/cancel via child notify', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers } = yield* makeHandlers(calls);

        yield* handlers['session/cancel']({ sessionId: 'sess-1' });

        assert.deepStrictEqual(yield* Ref.get(calls), ['notify:session/cancel:sess-1']);
      }),
    );

    layeredIt.effect('session/prompt fails with AcpError when child prompt fails (not die)', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { configs, loaded } = yield* makeHandlers(calls);
        const base = makeFakeChild(calls);
        const failingChild = {
          ...base,
          agent: {
            ...base.agent,
            'session/prompt': () => Effect.fail({ message: 'Child process exited with code 1' }),
          },
        } as unknown as GeminiChild;
        const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(failingChild), loaded, configs);
        const promptEffect = handlers['session/prompt']({
          prompt: [{ text: 'hi', type: 'text' }],
          sessionId: 'sess-1',
        }) as Effect.Effect<{ readonly stopReason: string }, { readonly code: number; readonly message: string }>;

        const exit = yield* Effect.exit(promptEffect);
        assert.isTrue(Exit.isFailure(exit));
        if (Exit.isFailure(exit)) {
          assert.isFalse(Cause.hasDies(exit.cause));
          assert.deepStrictEqual(Cause.squash(exit.cause), {
            code: -32603,
            message: 'Child process exited with code 1',
          });
        }
      }),
    );

    layeredIt.effect('idempotent delete and close for unknown sessionId', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers } = yield* makeHandlers(calls);

        yield* handlers['session/close']({ sessionId: 'missing' });
        yield* handlers['session/delete']({ sessionId: 'missing' });
        assert.deepStrictEqual(yield* Ref.get(calls), []);
      }),
    );

    layeredIt.effect('maps mode set_config_option to session/set_mode', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const { handlers } = yield* makeHandlers(calls);

        yield* handlers['session/new']({ cwd: '/tmp/proj', mcpServers: [] });
        yield* Ref.set(calls, []);

        const setMode = yield* handlers['session/set_config_option']({
          configId: 'mode',
          sessionId: 'sess-1',
          value: 'yolo',
        });
        const modeOption = (setMode.configOptions as readonly { currentValue?: string; id?: string }[]).find(
          option => option.id === 'mode',
        );
        assert.strictEqual(modeOption?.currentValue, 'yolo');
        assert.deepStrictEqual(yield* Ref.get(calls), ['session/set_mode:yolo']);
      }),
    );
  });
});
