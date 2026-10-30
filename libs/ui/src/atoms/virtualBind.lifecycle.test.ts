import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialBackendHarnessSnapshot, normalizeSessionRoster } from '../host/acpSessionBootstrap.ts';
import { clearConnectedAgent, setConnectedAgent } from '../host/sessionRpc.ts';
import { emptySessionTranscript } from '../host/sessionUpdateReducer.ts';

import { backendHarnessStateAtom, selectedAtom, virtualLifecycleInFlightAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { selectedActiveSessionAtom } from './selectedActiveSession.atoms.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import {
  ensureVirtualAcpBound,
  excludeBoundVirtualFromRoster,
  rwFromRegistry,
  teardownVirtualAcpBind,
} from './virtualBind.ts';
import {
  clearSelectedEffect,
  patchVirtualSession,
  selectSessionEffect,
  setVirtualLaunchTarget,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

const selectableConfig = {
  configOptions: [
    {
      currentValue: 'gpt',
      id: 'model',
      name: 'Model',
      options: [
        { name: 'gpt', value: 'gpt' },
        { name: 'o1', value: 'o1' },
      ],
      type: 'select' as const,
    },
  ],
};

type MockOpts = {
  readonly failDelete?: boolean;
  readonly failNew?: boolean;
};

const installMockAgent = (calls: string[], opts: MockOpts = {}) => {
  let nextId = 1;
  setConnectedAgent('codex-acp', {
    agent: {
      'session/close': ({ sessionId }: { sessionId: string }) => {
        calls.push(`close:${sessionId}`);
        return Effect.void;
      },
      'session/delete': ({ sessionId }: { sessionId: string }) => {
        calls.push(`delete:${sessionId}`);
        return opts.failDelete === true ? Effect.fail('delete-fail') : Effect.void;
      },
      'session/new': () => {
        calls.push('new');
        if (opts.failNew === true) {
          return Effect.fail('new-fail');
        }
        const sessionId = `bound-${nextId}`;
        nextId += 1;
        return Effect.succeed({ ...selectableConfig, sessionId });
      },
      'session/prompt': () => {
        calls.push('prompt');
        return Effect.succeed({ stopReason: 'end_turn' as const });
      },
      'session/set_config_option': ({ configId, value }: { configId: string; value: unknown }) => {
        calls.push(`set:${configId}:${String(value)}`);
        return Effect.succeed({
          configOptions: [
            {
              currentValue: value,
              id: configId,
              name: configId,
              options: selectableConfig.configOptions[0]?.options ?? [],
              type: 'select' as const,
            },
          ],
        });
      },
    },
    notify: () => Effect.void,
    sessionArchive: () => Effect.fail('no-archive'),
    sessionFork: () => Effect.fail('no-fork'),
  } as unknown as Parameters<typeof setConnectedAgent>[1]);
};

const seedReadyVirtual = (
  registry: AtomRegistry.AtomRegistry,
  overrides: {
    readonly configValues?: Record<string, boolean | string>;
    readonly cwd?: string;
    readonly draft?: string;
    readonly sessionId?: string;
  } = {},
) => {
  registry.set(backendHarnessStateAtom('codex-acp'), {
    ...initialBackendHarnessSnapshot(),
    phase: 'ready',
  });
  registry.set(selectedAtom, { _tag: 'Virtual' });
  registry.set(virtualSessionAtom, {
    attachments: [],
    configValues: overrides.configValues ?? {},
    cwd: overrides.cwd ?? '/proj',
    draft: overrides.draft ?? '',
    launchTarget: 'codex-acp',
    sessionId: overrides.sessionId,
  });
};

describe('excludeBoundVirtualFromRoster', () => {
  it('filters Bound id; normalizeSessionRoster still returns it', () => {
    const listResult = {
      sessions: [
        { cwd: '/proj', sessionId: 'bound-1' },
        { cwd: '/other', sessionId: 'real-1' },
      ],
    };
    const normalized = normalizeSessionRoster(listResult);
    assert.strictEqual(normalized.length, 2);
    const published = excludeBoundVirtualFromRoster(normalized, 'bound-1');
    assert.deepStrictEqual(
      published.map(entry => entry.sessionId),
      ['real-1'],
    );
  });
});

describe('ensureVirtualAcpBound', () => {
  it.effect('cwd+LT+Ready → session/new once; Virtual gains sessionId; sessions map has row; roster lacks id', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const fsListingRefreshArgs: { cwd: string; sessionId: string }[] = [];
      installMockAgent(calls);
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry);

      yield* ensureVirtualAcpBound(rw, arg =>
        Effect.sync(() => {
          fsListingRefreshArgs.push(arg);
        }),
      );

      assert.deepStrictEqual(calls, ['new']);
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-1');
      const snapshot = registry.get(backendHarnessStateAtom('codex-acp'));
      assert.strictEqual(snapshot.sessions['bound-1'].status, 'active');
      assert.strictEqual(snapshot.sessionRoster.length, 0);
      // `@` FS listing keys off active session (Bound Virtual), not Session-arm Selected.
      assert.deepStrictEqual(registry.get(selectedActiveSessionAtom), {
        cwd: '/proj',
        launchTarget: 'codex-acp',
        sessionId: 'bound-1',
      });
      assert.deepStrictEqual(fsListingRefreshArgs, [{ cwd: '/proj', sessionId: 'bound-1' }]);

      yield* ensureVirtualAcpBound(rw, arg =>
        Effect.sync(() => {
          fsListingRefreshArgs.push(arg);
        }),
      );
      assert.deepStrictEqual(calls, ['new']);
      assert.deepStrictEqual(fsListingRefreshArgs, [{ cwd: '/proj', sessionId: 'bound-1' }]);
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('failed Bind → unbound, no fake id', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls, { failNew: true });
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry);

      yield* ensureVirtualAcpBound(rw);

      assert.deepStrictEqual(calls, ['new']);
      assert.isUndefined(registry.get(virtualSessionAtom)?.sessionId);
      assert.deepStrictEqual(registry.get(backendHarnessStateAtom('codex-acp')).sessions, {});
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('Bind does not apply Virtual configValues (no set_config_option)', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry, { configValues: { model: 'o1' } });

      yield* ensureVirtualAcpBound(rw);

      assert.deepStrictEqual(calls, ['new']);
      assert.strictEqual(registry.get(virtualSessionAtom)?.configValues.model, 'o1');
      assert.strictEqual(registry.get(backendHarnessStateAtom('codex-acp')).sessions['bound-1'].selectedModelId, 'gpt');
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('draft-only / configValues-only patch → no session/new', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry, { sessionId: 'bound-1' });
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          'bound-1': {
            cwd: '/proj',
            sessionConfiguration: selectableConfig,
            sessionId: 'bound-1',
            status: 'active',
            transcript: emptySessionTranscript(),
          },
        },
      });

      patchVirtualSession(rw, { draft: 'hello' });
      patchVirtualSession(rw, { configValues: { model: 'o1' } });
      yield* ensureVirtualAcpBound(rw);

      assert.deepStrictEqual(calls, []);
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-1');
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('cwd change → teardown + recreate', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry, { sessionId: 'bound-1' });
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          'bound-1': {
            cwd: '/proj',
            sessionConfiguration: selectableConfig,
            sessionId: 'bound-1',
            status: 'active',
            transcript: emptySessionTranscript(),
          },
        },
      });

      // Blob cwd ahead of Bound session cwd — ensure tears down and recreates.
      const current = registry.get(virtualSessionAtom);
      assert.isNotNull(current);
      registry.set(virtualSessionAtom, {
        ...current,
        cwd: '/other',
      });
      yield* ensureVirtualAcpBound(rw);

      assert.ok(calls.includes('close:bound-1'));
      assert.ok(calls.includes('delete:bound-1'));
      assert.ok(calls.includes('new'));
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-1');
      assert.strictEqual(registry.get(backendHarnessStateAtom('codex-acp')).sessions['bound-1'].cwd, '/other');
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('LT change → close+delete old then Bind new; draft kept; Config hard-reset', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      setConnectedAgent('claude-agent-acp', {
        agent: {
          'session/close': ({ sessionId }: { sessionId: string }) => {
            calls.push(`close:${sessionId}`);
            return Effect.void;
          },
          'session/delete': ({ sessionId }: { sessionId: string }) => {
            calls.push(`delete:${sessionId}`);
            return Effect.void;
          },
          'session/new': () => {
            calls.push('new:claude');
            return Effect.succeed({ ...selectableConfig, sessionId: 'claude-1' });
          },
          'session/set_config_option': () => Effect.succeed(selectableConfig),
        },
        notify: () => Effect.void,
        sessionArchive: () => Effect.fail('no-archive'),
        sessionFork: () => Effect.fail('no-fork'),
      } as unknown as Parameters<typeof setConnectedAgent>[1]);

      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry, { draft: 'keep me', sessionId: 'bound-1' });
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          'bound-1': {
            cwd: '/proj',
            sessionConfiguration: selectableConfig,
            sessionId: 'bound-1',
            status: 'active',
            transcript: emptySessionTranscript(),
          },
        },
      });
      registry.set(backendHarnessStateAtom('claude-agent-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
      });

      yield* teardownVirtualAcpBind(rw, { launchTarget: 'codex-acp', sessionId: 'bound-1' });
      setVirtualLaunchTarget(rw, 'claude-agent-acp');
      yield* ensureVirtualAcpBound(rw);

      assert.ok(calls.includes('close:bound-1'));
      assert.ok(calls.includes('delete:bound-1'));
      assert.ok(calls.includes('new:claude'));
      const blob = registry.get(virtualSessionAtom);
      assert.strictEqual(blob?.draft, 'keep me');
      assert.strictEqual(blob?.launchTarget, 'claude-agent-acp');
      assert.strictEqual(blob?.sessionId, 'claude-1');
      clearConnectedAgent('codex-acp');
      clearConnectedAgent('claude-agent-acp');
    }),
  );

  it.effect('failed delete on swap → replacement Bind still attempted', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls, { failDelete: true });
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry, { cwd: '/proj', sessionId: 'bound-1' });
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          'bound-1': {
            cwd: '/proj',
            sessionConfiguration: selectableConfig,
            sessionId: 'bound-1',
            status: 'active',
            transcript: emptySessionTranscript(),
          },
        },
      });

      yield* teardownVirtualAcpBind(rw, { launchTarget: 'codex-acp', sessionId: 'bound-1' });
      patchVirtualSession(rw, { cwd: '/other' });
      yield* ensureVirtualAcpBound(rw);

      assert.ok(calls.includes('delete:bound-1'));
      assert.ok(calls.includes('new'));
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-1');
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('discard Bound → delete + clear Virtual + Selected unset; no roster row', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry, { sessionId: 'bound-1' });
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          'bound-1': {
            cwd: '/proj',
            sessionConfiguration: selectableConfig,
            sessionId: 'bound-1',
            status: 'active',
            transcript: emptySessionTranscript(),
          },
        },
      });

      yield* clearSelectedEffect(rw);

      assert.ok(calls.includes('close:bound-1'));
      assert.ok(calls.includes('delete:bound-1'));
      assert.isNull(registry.get(virtualSessionAtom));
      assert.isUndefined(registry.get(selectedAtom));
      assert.strictEqual(registry.get(backendHarnessStateAtom('codex-acp')).sessionRoster.length, 0);
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('selectSession while Bound Virtual → teardown Bound + clear blob + Select Session', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry, { sessionId: 'bound-1' });
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          'bound-1': {
            cwd: '/proj',
            sessionConfiguration: selectableConfig,
            sessionId: 'bound-1',
            status: 'active',
            transcript: emptySessionTranscript(),
          },
        },
      });

      yield* selectSessionEffect(rw, 'real-1');

      assert.ok(calls.includes('close:bound-1'));
      assert.ok(calls.includes('delete:bound-1'));
      assert.isNull(registry.get(virtualSessionAtom));
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
      clearConnectedAgent('codex-acp');
    }),
  );
});

describe('setConfigOptionAtomFn Bound Virtual', () => {
  it.effect('Bound Config change → setConfigOption RPC + blob configValues updated', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const runtime = createHostRuntime(mockHostLayer);
      const { setConfigOptionAtomFn } = createChatAtoms(runtime);
      const registry = AtomRegistry.make();
      registry.mount(setConfigOptionAtomFn);

      seedReadyVirtual(registry, { configValues: { model: 'gpt' }, sessionId: 'bound-1' });
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          'bound-1': {
            cwd: '/proj',
            sessionConfiguration: selectableConfig,
            sessionId: 'bound-1',
            status: 'active',
            transcript: emptySessionTranscript(),
          },
        },
      });

      yield* runAtomFn(registry, setConfigOptionAtomFn, {
        configId: 'model',
        launchTarget: 'codex-acp',
        type: 'select',
        value: 'o1',
      });

      assert.ok(calls.some(call => call.startsWith('set:model:o1')));
      assert.strictEqual(registry.get(virtualSessionAtom)?.configValues.model, 'o1');
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );
});

describe('materializeVirtualThenSendAtomFn', () => {
  it.effect('first Send Bound → no second session/new; roster gains id; Selected Session', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const runtime = createHostRuntime(mockHostLayer);
      const { materializeVirtualThenSendAtomFn } = createChatAtoms(runtime);
      const registry = AtomRegistry.make();
      registry.mount(materializeVirtualThenSendAtomFn);

      seedReadyVirtual(registry, { draft: 'hello world', sessionId: 'bound-1' });
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          'bound-1': {
            cwd: '/proj',
            sessionConfiguration: selectableConfig,
            sessionId: 'bound-1',
            status: 'active',
            transcript: emptySessionTranscript(),
          },
        },
      });

      yield* runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined);

      assert.ok(!calls.includes('new'));
      assert.ok(calls.includes('prompt'));
      assert.isNull(registry.get(virtualSessionAtom));
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
      assert.strictEqual(
        registry.get(backendHarnessStateAtom('codex-acp')).sessionRoster.some(entry => entry.sessionId === 'bound-1'),
        true,
      );
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('Send while Bind in-flight → no-op', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const runtime = createHostRuntime(mockHostLayer);
      const { materializeVirtualThenSendAtomFn } = createChatAtoms(runtime);
      const registry = AtomRegistry.make();
      registry.mount(materializeVirtualThenSendAtomFn);

      seedReadyVirtual(registry, { draft: 'hello' });
      registry.set(virtualLifecycleInFlightAtom, true);

      yield* runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined);

      assert.deepStrictEqual(calls, []);
      assert.isUndefined(registry.get(virtualSessionAtom)?.sessionId);
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('Send while unbound → no-op (Materialize does not Bind)', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const runtime = createHostRuntime(mockHostLayer);
      const { materializeVirtualThenSendAtomFn } = createChatAtoms(runtime);
      const registry = AtomRegistry.make();
      registry.mount(materializeVirtualThenSendAtomFn);

      seedReadyVirtual(registry, { draft: 'hello' });

      yield* runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined);

      assert.deepStrictEqual(calls, []);
      assert.isUndefined(registry.get(virtualSessionAtom)?.sessionId);
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );
});
