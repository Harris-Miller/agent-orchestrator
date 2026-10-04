import { assert, describe, layer } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { Effect, Layer, Ref } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import type { File } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { beforeEach } from 'vitest';

import { ADAPTER_AGENT_INFO } from './adapterAgentInfo.ts';
import { makeGeminiAcpAgentHandlerMap } from './agentHandlers.ts';
import type { GeminiChild } from './geminiChild.ts';
import { isLoaded, makeLoadedSet } from './sessionLifecycle.ts';

const HOMEDIR = '/home/operator';

type FsEntry = { readonly content: string; readonly kind: 'file' } | { readonly kind: 'dir' };

const osLayer = Layer.succeed(OS, {
  cwd: () => HOMEDIR,
  env: () => ({}),
  homedir: () => HOMEDIR,
  platform: () => 'linux',
});

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'NotFound',
    description: 'No such file or directory',
    method,
    module: 'FileSystem',
    pathOrDescriptor: path,
  });

const alreadyExists = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'AlreadyExists',
    description: 'File exists',
    method,
    module: 'FileSystem',
    pathOrDescriptor: path,
  });

const noopFile = {} as File;

const mapFsLayer = (store: Map<string, FsEntry>) =>
  layerNoop({
    exists: path => Effect.succeed(store.has(path)),
    makeDirectory: path =>
      Effect.sync(() => {
        store.set(path, { kind: 'dir' });
      }),
    open: (path, options) =>
      Effect.acquireRelease(
        Effect.gen(function* () {
          if (options?.flag === 'wx' && store.has(path)) {
            return yield* alreadyExists('open', path);
          }
          if (options?.flag === 'wx') {
            store.set(path, { content: '', kind: 'file' });
          } else if (!store.has(path)) {
            return yield* notFound('open', path);
          }
          return noopFile;
        }),
        () => Effect.void,
      ),
    readFileString: path => {
      const entry = store.get(path);
      if (entry?.kind === 'file') {
        return Effect.succeed(entry.content);
      }
      return notFound('readFileString', path);
    },
    remove: (path, options) =>
      Effect.sync(() => {
        const present = store.has(path) || [...store.keys()].some(key => key.startsWith(`${path}/`));
        if (!present) {
          if (options?.force === true) {
            return;
          }
          throw notFound('remove', path);
        }
        for (const key of [...store.keys()]) {
          if (key === path || key.startsWith(`${path}/`)) {
            store.delete(key);
          }
        }
      }),
    writeFileString: (path, data) =>
      Effect.sync(() => {
        store.set(path, { content: data, kind: 'file' });
      }),
  });

const services = (store: Map<string, FsEntry>) =>
  Layer.mergeAll(posixPathLayer, mapFsLayer(store)).pipe(Layer.provideMerge(osLayer));

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
          return { configOptions: [], modes: null };
        }),
      'session/new': (request: { readonly cwd: string }) =>
        Effect.gen(function* () {
          yield* Ref.update(calls, c => [...c, `session/new:${request.cwd}`]);
          return { sessionId: 'sess-1' };
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
  }) as GeminiChild;

describe('makeGeminiAcpAgentHandlerMap', () => {
  const store = new Map<string, FsEntry>();

  beforeEach(() => {
    store.clear();
  });

  layer(services(store))(layeredIt => {
    layeredIt.effect('rewrites initialize caps and agentInfo', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const loaded = yield* makeLoadedSet();
        const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded);

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

    layeredIt.effect('forwards prompt/config and persists new/load on adapter roster', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const loaded = yield* makeLoadedSet();
        const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded);

        const created = yield* handlers['session/new']({ cwd: '/tmp/proj', mcpServers: [] });
        assert.strictEqual(created.sessionId, 'sess-1');
        assert.isTrue(yield* isLoaded(loaded, 'sess-1'));

        yield* handlers['session/prompt']({
          prompt: [{ text: 'hi', type: 'text' }],
          sessionId: 'sess-1',
        });
        yield* handlers['session/set_config_option']({
          configId: 'model',
          sessionId: 'sess-1',
          value: 'x',
        });

        const listed = yield* handlers['session/list']({});
        assert.strictEqual(listed.sessions.length, 1);
        assert.strictEqual(listed.sessions[0]?.sessionId, 'sess-1');
        assert.strictEqual(listed.sessions[0]?.cwd, '/tmp/proj');
        assert.isString(listed.sessions[0]?.updatedAt);

        assert.deepStrictEqual(yield* Ref.get(calls), [
          'session/new:/tmp/proj',
          'session/prompt:sess-1',
          'session/set_config_option:model',
        ]);
      }),
    );

    layeredIt.effect('list filters by cwd when provided', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const loaded = yield* makeLoadedSet();
        const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded);

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

    layeredIt.effect('soft close cancels when loaded, keeps roster row, second close is idle', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const loaded = yield* makeLoadedSet();
        const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded);

        yield* handlers['session/new']({ cwd: '/tmp/proj', mcpServers: [] });
        yield* Ref.set(calls, []);

        yield* handlers['session/close']({ sessionId: 'sess-1' });
        assert.isFalse(yield* isLoaded(loaded, 'sess-1'));
        assert.deepStrictEqual(yield* Ref.get(calls), ['notify:session/cancel:sess-1']);

        const listed = yield* handlers['session/list']({});
        assert.strictEqual(listed.sessions.length, 1);

        yield* Ref.set(calls, []);
        yield* handlers['session/close']({ sessionId: 'sess-1' });
        assert.deepStrictEqual(yield* Ref.get(calls), []);
      }),
    );

    layeredIt.effect('soft delete removes roster entry and drops loaded mark', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const loaded = yield* makeLoadedSet();
        const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded);

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
        const loaded1 = yield* makeLoadedSet();
        const handlers1 = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded1);
        yield* handlers1['session/new']({ cwd: '/tmp/proj', mcpServers: [] });

        const loaded2 = yield* makeLoadedSet();
        const handlers2 = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded2);
        assert.isFalse(yield* isLoaded(loaded2, 'sess-1'));

        const listed = yield* handlers2['session/list']({});
        assert.strictEqual(listed.sessions.length, 1);
        assert.strictEqual(listed.sessions[0]?.sessionId, 'sess-1');
      }),
    );

    layeredIt.effect('hot resume skips child load; cold resume maps to session/load', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const loaded = yield* makeLoadedSet();
        const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded);

        yield* handlers['session/new']({ cwd: '/tmp/proj', mcpServers: [] });
        yield* Ref.set(calls, []);

        const hot = yield* handlers['session/resume']({ cwd: '/tmp/proj', sessionId: 'sess-1' });
        assert.deepStrictEqual(hot, {});
        assert.deepStrictEqual(yield* Ref.get(calls), []);

        yield* handlers['session/close']({ sessionId: 'sess-1' });
        yield* Ref.set(calls, []);

        const cold = yield* handlers['session/resume']({ cwd: '/tmp/proj', sessionId: 'sess-1' });
        assert.deepStrictEqual(cold, { configOptions: [], modes: null });
        assert.isTrue(yield* isLoaded(loaded, 'sess-1'));
        assert.deepStrictEqual(yield* Ref.get(calls), ['session/load:sess-1:mcp=[]']);
      }),
    );

    layeredIt.effect('cold resume after restart loads with empty mcpServers', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const loaded1 = yield* makeLoadedSet();
        const handlers1 = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded1);
        yield* handlers1['session/new']({ cwd: '/tmp/proj', mcpServers: [] });

        const loaded2 = yield* makeLoadedSet();
        const handlers2 = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded2);
        yield* Ref.set(calls, []);

        yield* handlers2['session/resume']({ cwd: '/tmp/proj', sessionId: 'sess-1' });
        assert.isTrue(yield* isLoaded(loaded2, 'sess-1'));
        assert.deepStrictEqual(yield* Ref.get(calls), ['session/load:sess-1:mcp=[]']);
      }),
    );

    layeredIt.effect('forwards session/cancel via child notify', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const loaded = yield* makeLoadedSet();
        const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded);

        yield* handlers['session/cancel']({ sessionId: 'sess-1' });

        assert.deepStrictEqual(yield* Ref.get(calls), ['notify:session/cancel:sess-1']);
      }),
    );

    layeredIt.effect('idempotent delete and close for unknown sessionId', () =>
      Effect.gen(function* () {
        const calls = yield* Ref.make<string[]>([]);
        const loaded = yield* makeLoadedSet();
        const handlers = makeGeminiAcpAgentHandlerMap(Effect.succeed(makeFakeChild(calls)), loaded);

        yield* handlers['session/close']({ sessionId: 'missing' });
        yield* handlers['session/delete']({ sessionId: 'missing' });
        assert.deepStrictEqual(yield* Ref.get(calls), []);
      }),
    );
  });
});
