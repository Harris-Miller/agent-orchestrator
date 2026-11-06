import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialBackendHarnessSnapshot, normalizeSessionHistory } from '../host/acpSessionBootstrap.ts';
import { clearConnectedAgent, setConnectedAgent } from '../host/sessionRpc.ts';
import { emptySessionTranscript } from '../host/sessionUpdateReducer.ts';

import {
  backendHarnessStateAtom,
  selectedAtom,
  virtualMaterializingAtom,
  virtualSendPendingAtom,
} from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { selectedActiveSessionAtom } from './selectedActiveSession.atoms.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import {
  awaitCurrentVirtualBind,
  ensureVirtualAcpBound,
  excludeBoundVirtualFromHistory,
  mutateVirtualThenRebind,
  requestVirtualBind,
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
  /** Runs inside `session/new` before it resolves (simulates user action mid-Bind). */
  readonly duringNew?: Effect.Effect<void>;
  /** Runs inside `session/set_config_option` before it resolves (simulates user action mid-Materialize). */
  readonly duringSetConfig?: Effect.Effect<void>;
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
        return Effect.as(opts.duringNew ?? Effect.void, { ...selectableConfig, sessionId });
      },
      'session/prompt': ({ sessionId }: { sessionId: string }) => {
        calls.push('prompt');
        calls.push(`prompt:${sessionId}`);
        return Effect.succeed({ stopReason: 'end_turn' as const });
      },
      'session/set_config_option': ({ configId, value }: { configId: string; value: unknown }) => {
        calls.push(`set:${configId}:${String(value)}`);
        return Effect.as(opts.duringSetConfig ?? Effect.void, {
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

const seedBoundSession = (registry: AtomRegistry.AtomRegistry, sessionId: string) => {
  registry.set(backendHarnessStateAtom('codex-acp'), {
    ...initialBackendHarnessSnapshot(),
    phase: 'ready',
    sessions: {
      [sessionId]: {
        cwd: '/proj',
        sessionConfiguration: selectableConfig,
        sessionId,
        status: 'active',
        transcript: emptySessionTranscript(),
      },
    },
  });
};

describe('excludeBoundVirtualFromHistory', () => {
  it('filters Bound id; normalizeSessionHistory still returns it', () => {
    const listResult = {
      sessions: [
        { cwd: '/proj', sessionId: 'bound-1' },
        { cwd: '/other', sessionId: 'real-1' },
      ],
    };
    const normalized = normalizeSessionHistory(listResult);
    assert.strictEqual(normalized.length, 2);
    const published = excludeBoundVirtualFromHistory(normalized, 'bound-1');
    assert.deepStrictEqual(
      published.map(entry => entry.sessionId),
      ['real-1'],
    );
  });
});

describe('ensureVirtualAcpBound', () => {
  it.effect('cwd+LT+Ready → session/new once; Virtual gains sessionId; sessions map has row; history lacks id', () =>
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
      assert.strictEqual(snapshot.sessionHistory.length, 0);
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

  it.effect('usable phase (probe not done) → Bind runs; list that landed first has its Bound id dropped', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry);
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'usable',
        sessionHistory: normalizeSessionHistory({
          sessions: [
            { cwd: '/proj', sessionId: 'bound-1' },
            { cwd: '/proj', sessionId: 'other' },
          ],
        }),
      });

      yield* ensureVirtualAcpBound(rw);

      assert.deepStrictEqual(calls, ['new']);
      assert.deepStrictEqual(
        registry.get(backendHarnessStateAtom('codex-acp')).sessionHistory.map(entry => entry.sessionId),
        ['other'],
      );
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

  it.effect('discard Bound → delete + clear Virtual + Selected unset; no history row', () =>
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
      // Teardown runs in the background.
      yield* Effect.yieldNow;

      assert.ok(calls.includes('close:bound-1'));
      assert.ok(calls.includes('delete:bound-1'));
      assert.isNull(registry.get(virtualSessionAtom));
      assert.isUndefined(registry.get(selectedAtom));
      assert.strictEqual(registry.get(backendHarnessStateAtom('codex-acp')).sessionHistory.length, 0);
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
      // Teardown runs in the background.
      yield* Effect.yieldNow;

      assert.ok(calls.includes('close:bound-1'));
      assert.ok(calls.includes('delete:bound-1'));
      assert.isNull(registry.get(virtualSessionAtom));
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('selectSession with composer text → keep blob + Bound; no teardown', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry, { draft: 'half-typed', sessionId: 'bound-1' });
      seedBoundSession(registry, 'bound-1');

      yield* selectSessionEffect(rw, 'real-1');

      assert.deepStrictEqual(calls, []);
      assert.strictEqual(registry.get(virtualSessionAtom)?.draft, 'half-typed');
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-1');
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('clearSelected with composer text → keep blob; Selected unset', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      seedReadyVirtual(registry, { draft: 'half-typed', sessionId: 'bound-1' });
      seedBoundSession(registry, 'bound-1');

      yield* clearSelectedEffect(rw);

      assert.deepStrictEqual(calls, []);
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-1');
      assert.isUndefined(registry.get(selectedAtom));
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('selectSession mid-Bind, empty composer → Selected flips; orphan deleted after session/new', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      installMockAgent(calls, { duringNew: selectSessionEffect(rw, 'real-1') });
      seedReadyVirtual(registry);

      yield* ensureVirtualAcpBound(rw);

      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
      assert.isNull(registry.get(virtualSessionAtom));
      assert.ok(calls.includes('delete:bound-1'));
      assert.notProperty(registry.get(backendHarnessStateAtom('codex-acp')).sessions, 'bound-1');
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('selectSession mid-Bind, composer text → Selected flips; Bind finishes onto kept blob', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      installMockAgent(calls, { duringNew: selectSessionEffect(rw, 'real-1') });
      seedReadyVirtual(registry, { draft: 'half-typed' });

      yield* ensureVirtualAcpBound(rw);

      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-1');
      assert.strictEqual(registry.get(virtualSessionAtom)?.draft, 'half-typed');
      assert.isFalse(calls.some(call => call.startsWith('delete:')));
      clearConnectedAgent('codex-acp');
    }),
  );
});

/** Claude agent mock: ids `claude-N`; shares `calls` with the codex mock. */
const installClaudeAgent = (calls: string[]) => {
  let nextId = 1;
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
        const sessionId = `claude-${nextId}`;
        nextId += 1;
        return Effect.succeed({ ...selectableConfig, sessionId });
      },
      'session/prompt': ({ sessionId }: { sessionId: string }) => {
        calls.push(`prompt:${sessionId}`);
        return Effect.succeed({ stopReason: 'end_turn' as const });
      },
      'session/set_config_option': () => Effect.succeed(selectableConfig),
    },
    notify: () => Effect.void,
    sessionArchive: () => Effect.fail('no-archive'),
    sessionFork: () => Effect.fail('no-fork'),
  } as unknown as Parameters<typeof setConnectedAgent>[1]);
  return () => {
    clearConnectedAgent('claude-agent-acp');
  };
};

/** Run `effect` only the first time it is invoked (the mock `session/new` fires once per Bind). */
const onlyFirst = (effect: Effect.Effect<void>): Effect.Effect<void> => {
  let ran = false;
  return Effect.suspend(() => {
    if (ran) {
      return Effect.void;
    }
    ran = true;
    return effect;
  });
};

const switchLaunchTarget = (rw: ReturnType<typeof rwFromRegistry>, launchTarget: 'claude-agent-acp' | 'codex-acp') =>
  mutateVirtualThenRebind(rw, {
    mutate: inner => {
      setVirtualLaunchTarget(inner, launchTarget);
    },
  });

const patchVirtualCwd = (rw: ReturnType<typeof rwFromRegistry>, cwd: string) =>
  mutateVirtualThenRebind(rw, {
    mutate: inner => {
      patchVirtualSession(inner, { cwd });
    },
  });

describe('latest-wins Bind', () => {
  it.effect('provider switch mid-Bind is accepted without the Materialize lock; stale session torn down', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      let lockDuringBind: boolean | undefined;
      installMockAgent(calls, {
        duringNew: onlyFirst(
          Effect.gen(function* () {
            lockDuringBind = registry.get(virtualMaterializingAtom);
            yield* switchLaunchTarget(rw, 'claude-agent-acp');
          }),
        ),
      });
      const clearClaude = installClaudeAgent(calls);
      seedReadyVirtual(registry);
      registry.set(backendHarnessStateAtom('claude-agent-acp'), { ...initialBackendHarnessSnapshot(), phase: 'ready' });

      yield* ensureVirtualAcpBound(rw);
      yield* awaitCurrentVirtualBind(rw);

      assert.isFalse(lockDuringBind);
      assert.strictEqual(registry.get(virtualSessionAtom)?.launchTarget, 'claude-agent-acp');
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'claude-1');
      assert.ok(calls.includes('delete:bound-1'));
      assert.notProperty(registry.get(backendHarnessStateAtom('codex-acp')).sessions, 'bound-1');
      clearClaude();
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('rapid A-B-A switch → one live Bound session for A; the others are torn down', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      installMockAgent(calls, {
        duringNew: onlyFirst(
          Effect.gen(function* () {
            yield* switchLaunchTarget(rw, 'claude-agent-acp');
            yield* switchLaunchTarget(rw, 'codex-acp');
          }),
        ),
      });
      const clearClaude = installClaudeAgent(calls);
      seedReadyVirtual(registry);
      registry.set(backendHarnessStateAtom('claude-agent-acp'), { ...initialBackendHarnessSnapshot(), phase: 'ready' });

      yield* ensureVirtualAcpBound(rw);
      yield* awaitCurrentVirtualBind(rw);

      assert.strictEqual(registry.get(virtualSessionAtom)?.launchTarget, 'codex-acp');
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-2');
      assert.deepStrictEqual(Object.keys(registry.get(backendHarnessStateAtom('codex-acp')).sessions), ['bound-2']);
      assert.deepStrictEqual(Object.keys(registry.get(backendHarnessStateAtom('claude-agent-acp')).sessions), []);
      assert.ok(calls.includes('delete:bound-1'));
      assert.ok(calls.includes('delete:claude-1'));
      clearClaude();
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('teardown failure of the superseded session does not block the replacement Bind', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      installMockAgent(calls, { duringNew: onlyFirst(patchVirtualCwd(rw, '/other')), failDelete: true });
      seedReadyVirtual(registry);

      yield* ensureVirtualAcpBound(rw);
      yield* awaitCurrentVirtualBind(rw);

      assert.ok(calls.includes('delete:bound-1'));
      assert.strictEqual(registry.get(virtualSessionAtom)?.cwd, '/other');
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-2');
      clearConnectedAgent('codex-acp');
    }),
  );

  it.effect('same-key request while a Bind is in flight joins it (one session/new)', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = AtomRegistry.make();
      const rw = rwFromRegistry(registry);
      installMockAgent(calls, {
        duringNew: onlyFirst(
          mutateVirtualThenRebind(rw, {
            mutate: inner => {
              patchVirtualSession(inner, { draft: 'x' });
            },
          }),
        ),
      });
      seedReadyVirtual(registry);

      yield* ensureVirtualAcpBound(rw);
      yield* awaitCurrentVirtualBind(rw);

      assert.deepStrictEqual(calls, ['new']);
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-1');
      clearConnectedAgent('codex-acp');
    }),
  );
});

/** Bound session snapshot whose single `model` option currently reports `modelValue`. */
const sessionWithModelValue = (sessionId: string, modelValue: string) => ({
  cwd: '/proj',
  sessionConfiguration: { configOptions: [{ ...selectableConfig.configOptions[0], currentValue: modelValue }] },
  sessionId,
  status: 'active' as const,
  transcript: emptySessionTranscript(),
});

/** Seed a ready Virtual (blob model `gpt`), optionally Bound to a live session reporting `liveModel`, then select `o1`. */
const selectO1OnVirtual = (liveModel?: string) =>
  Effect.gen(function* () {
    const calls: string[] = [];
    installMockAgent(calls);
    const runtime = createHostRuntime(mockHostLayer);
    const { setConfigOptionAtomFn } = createChatAtoms(runtime);
    const registry = AtomRegistry.make();
    registry.mount(setConfigOptionAtomFn);

    const live = liveModel === undefined ? undefined : sessionWithModelValue('bound-1', liveModel);
    seedReadyVirtual(registry, { configValues: { model: 'gpt' }, ...(live && { sessionId: 'bound-1' }) });
    if (live !== undefined) {
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: { 'bound-1': live },
      });
    }

    yield* runAtomFn(registry, setConfigOptionAtomFn, {
      configId: 'model',
      launchTarget: 'codex-acp',
      type: 'select',
      value: 'o1',
    });

    assert.deepStrictEqual(calls, []);
    assert.strictEqual(registry.get(virtualSessionAtom)?.configValues.model, 'o1');
    assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
    if (live !== undefined) {
      assert.deepStrictEqual(registry.get(backendHarnessStateAtom('codex-acp')).sessions['bound-1'], live);
    }
    clearConnectedAgent('codex-acp');
    registry.dispose();
  });

describe('setConfigOptionAtomFn Virtual (blob-only)', () => {
  it.effect(
    'Virtual Config matching live Bound session → blob updated, no set_config_option, live unchanged (#217)',
    () => selectO1OnVirtual('o1'),
  );

  it.effect('Virtual Config differing from live Bound session → blob updated, no set_config_option', () =>
    selectO1OnVirtual('gpt'),
  );

  it.effect('unbound Virtual Config change → blob updated, no RPC', () => selectO1OnVirtual());
});

describe('materializeVirtualThenSendAtomFn', () => {
  it.effect('first Send Bound → no second session/new; history gains id; Selected Session', () =>
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
        registry.get(backendHarnessStateAtom('codex-acp')).sessionHistory.some(entry => entry.sessionId === 'bound-1'),
        true,
      );
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('first Send Bound with blob ≠ live Config → set_config_option applies blob diffs before prompt', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const runtime = createHostRuntime(mockHostLayer);
      const { materializeVirtualThenSendAtomFn } = createChatAtoms(runtime);
      const registry = AtomRegistry.make();
      registry.mount(materializeVirtualThenSendAtomFn);

      seedReadyVirtual(registry, { configValues: { model: 'o1' }, draft: 'hello world', sessionId: 'bound-1' });
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: { 'bound-1': sessionWithModelValue('bound-1', 'gpt') },
      });

      yield* runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined);

      assert.ok(calls.includes('set:model:o1'));
      assert.ok(calls.indexOf('set:model:o1') < calls.indexOf('prompt'));
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('navigate away mid-Materialize → Selected stays; prompt still sent to materialized session', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const runtime = createHostRuntime(mockHostLayer);
      const { materializeVirtualThenSendAtomFn } = createChatAtoms(runtime);
      const registry = AtomRegistry.make();
      registry.mount(materializeVirtualThenSendAtomFn);
      installMockAgent(calls, { duringSetConfig: selectSessionEffect(rwFromRegistry(registry), 'real-1') });

      seedReadyVirtual(registry, { configValues: { model: 'o1' }, draft: 'hello', sessionId: 'bound-1' });
      seedBoundSession(registry, 'bound-1');

      yield* runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined);

      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
      assert.isNull(registry.get(virtualSessionAtom));
      assert.ok(calls.includes('prompt:bound-1'));
      assert.strictEqual(
        registry.get(backendHarnessStateAtom('codex-acp')).sessionHistory.some(entry => entry.sessionId === 'bound-1'),
        true,
      );
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  const setupSend = () => {
    const runtime = createHostRuntime(mockHostLayer);
    const { materializeVirtualThenSendAtomFn } = createChatAtoms(runtime);
    const registry = AtomRegistry.make();
    registry.mount(materializeVirtualThenSendAtomFn);
    return { materializeVirtualThenSendAtomFn, registry, rw: rwFromRegistry(registry) };
  };

  it.effect('Send mid-Bind awaits the Bind, then Materializes and prompts the Bound session', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* Deferred.make<undefined>();
      installMockAgent(calls, { duringNew: onlyFirst(Deferred.await(gate)) });
      const { materializeVirtualThenSendAtomFn, registry, rw } = setupSend();
      seedReadyVirtual(registry, { draft: 'hello' });
      yield* requestVirtualBind(rw);

      const send = yield* Effect.forkChild(runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined));
      yield* Effect.yieldNow;

      assert.deepStrictEqual(calls, ['new']);
      assert.isTrue(registry.get(virtualSendPendingAtom));
      assert.strictEqual(registry.get(virtualSessionAtom)?.draft, 'hello');

      yield* Deferred.succeed(gate, undefined);
      yield* Fiber.join(send);

      assert.deepStrictEqual(calls, ['new', 'prompt', 'prompt:bound-1']);
      assert.isFalse(registry.get(virtualSendPendingAtom));
      assert.isNull(registry.get(virtualSessionAtom));
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('Send while unbound with no Bind in flight → requests a Bind itself, then sends', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const { materializeVirtualThenSendAtomFn, registry } = setupSend();
      seedReadyVirtual(registry, { draft: 'hello' });

      yield* runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined);

      assert.deepStrictEqual(calls, ['new', 'prompt', 'prompt:bound-1']);
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('Send before the provider is usable waits for it', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const { materializeVirtualThenSendAtomFn, registry } = setupSend();
      seedReadyVirtual(registry, { draft: 'hello' });
      registry.set(backendHarnessStateAtom('codex-acp'), { ...initialBackendHarnessSnapshot(), phase: 'connecting' });

      const send = yield* Effect.forkChild(runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined));
      yield* Effect.yieldNow;
      assert.deepStrictEqual(calls, []);
      assert.isTrue(registry.get(virtualSendPendingAtom));

      registry.set(backendHarnessStateAtom('codex-acp'), { ...initialBackendHarnessSnapshot(), phase: 'usable' });
      yield* Fiber.join(send);

      assert.deepStrictEqual(calls, ['new', 'prompt', 'prompt:bound-1']);
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('Send then provider switch while awaiting → follows the latest Bind and prompts the new provider', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* Deferred.make<undefined>();
      installMockAgent(calls, { duringNew: onlyFirst(Deferred.await(gate)) });
      const clearClaude = installClaudeAgent(calls);
      const { materializeVirtualThenSendAtomFn, registry, rw } = setupSend();
      seedReadyVirtual(registry, { draft: 'hello' });
      registry.set(backendHarnessStateAtom('claude-agent-acp'), { ...initialBackendHarnessSnapshot(), phase: 'ready' });

      const send = yield* Effect.forkChild(runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined));
      yield* Effect.yieldNow;
      yield* switchLaunchTarget(rw, 'claude-agent-acp');
      yield* Deferred.succeed(gate, undefined);
      yield* Fiber.join(send);

      assert.ok(calls.includes('prompt:claude-1'));
      assert.isFalse(calls.includes('prompt:bound-1'));
      assert.ok(calls.includes('delete:bound-1'));
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'claude-1' });
      clearClaude();
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('Send when the provider ends in error → fails, draft kept, no longer pending', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls);
      const { materializeVirtualThenSendAtomFn, registry } = setupSend();
      seedReadyVirtual(registry, { draft: 'hello' });
      registry.set(backendHarnessStateAtom('codex-acp'), { ...initialBackendHarnessSnapshot(), phase: 'connecting' });

      const send = yield* Effect.forkChild(
        Effect.exit(runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined)),
      );
      yield* Effect.yieldNow;
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...initialBackendHarnessSnapshot(),
        failure: { _tag: 'Failed', message: 'boom' },
        phase: 'error',
      });
      const exit = yield* Fiber.join(send);

      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(calls, []);
      assert.strictEqual(registry.get(virtualSessionAtom)?.draft, 'hello');
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
      assert.isFalse(registry.get(virtualSendPendingAtom));
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('Send when Bind fails → fails, draft kept, no prompt', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      installMockAgent(calls, { failNew: true });
      const { materializeVirtualThenSendAtomFn, registry } = setupSend();
      seedReadyVirtual(registry, { draft: 'hello' });

      const exit = yield* Effect.exit(runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined));

      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(calls, ['new']);
      assert.strictEqual(registry.get(virtualSessionAtom)?.draft, 'hello');
      assert.isFalse(registry.get(virtualSendPendingAtom));
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('second Send while one is pending is ignored (single prompt)', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* Deferred.make<undefined>();
      installMockAgent(calls, { duringNew: onlyFirst(Deferred.await(gate)) });
      const { materializeVirtualThenSendAtomFn, registry, rw } = setupSend();
      seedReadyVirtual(registry, { draft: 'hello' });
      yield* requestVirtualBind(rw);

      const first = yield* Effect.forkChild(runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined));
      yield* Effect.yieldNow;
      const second = yield* Effect.forkChild(runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined));
      yield* Effect.yieldNow;
      yield* Deferred.succeed(gate, undefined);
      yield* Fiber.join(first);
      yield* Fiber.join(second);

      assert.strictEqual(calls.filter(call => call === 'prompt').length, 1);
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.effect('edits during Materialize are ignored', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const { materializeVirtualThenSendAtomFn, registry, rw } = setupSend();
      let draftAfterEdit: string | undefined;
      installMockAgent(calls, {
        duringSetConfig: Effect.sync(() => {
          patchVirtualSession(rw, { draft: 'changed' });
          draftAfterEdit = registry.get(virtualSessionAtom)?.draft;
        }),
      });
      seedReadyVirtual(registry, { configValues: { model: 'o1' }, draft: 'hello', sessionId: 'bound-1' });
      seedBoundSession(registry, 'bound-1');

      yield* runAtomFn(registry, materializeVirtualThenSendAtomFn, undefined);

      assert.strictEqual(draftAfterEdit, 'hello');
      assert.ok(calls.includes('prompt:bound-1'));
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );
});
