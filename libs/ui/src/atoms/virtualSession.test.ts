import { assert, describe, it } from '@effect/vitest';
import { defaultSettings } from '@lib/hoa-home';
import { Deferred, Effect, Exit, Fiber } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { normalizeConfigOptions, normalizeSessionHistory } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { configValue } from '../host/sessionConfiguration.ts';

import { backendHarnessSnapshotAtom, configOptionIndexAtom, selectedAtom } from './backendState.atoms.ts';
import { userSettingsDocumentAtom } from './userSettings/userSettingsDocument.atoms.ts';
import { createComposerAtoms } from './composer.atoms.ts';
import {
  CLAUDE,
  CODEX,
  enableProviders,
  freshRegistry,
  gated,
  installFakeAgent,
  onlyFirst,
  selectableConfig,
  setPhase,
} from './fakeAgent.testing.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import { selectedActiveSessionAtom } from './selectedActiveSession.atoms.ts';
import type { MaterializedVirtual } from './virtualSession.atoms.ts';
import {
  bindVirtualOnUsable,
  createVirtualSessionAtoms,
  discardVirtual,
  editVirtual,
  ensureVirtual,
  lastCreateDefaultsAtom,
  resetVirtualOnProviderStopped,
  resetVirtualUnsupportedConfig,
  select,
  sendVirtual,
  setVirtualConfigOption,
  setVirtualLaunchTarget,
  updateVirtualDraft,
  virtualMaterializingAtom,
  virtualSendPendingAtom,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

const blob = (registry: Registry) => registry.get(virtualSessionAtom);
const sessionsOf = (registry: Registry, launchTarget: AgentLaunchTarget = CODEX) =>
  registry.get(backendHarnessSnapshotAtom(launchTarget)).sessions;

type SeedOpts = {
  readonly cwd?: string;
  readonly draft?: string;
  readonly launchTarget?: AgentLaunchTarget;
  readonly model?: string;
};

/** Selected Virtual on `cwd` + `launchTarget` (+ `model`, `draft`), unbound with no Bind in flight, provider `ready`. */
const seedUnbound = Effect.fnUntraced(function* (
  registry: Registry,
  { cwd = '/proj', draft, launchTarget = CODEX, model }: SeedOpts = {},
) {
  // Not usable yet, so none of the seeding verbs Binds; flipping the phase directly (no fold) triggers nothing.
  setPhase(registry, launchTarget, 'connecting');
  yield* ensureVirtual(registry, { cwd });
  yield* setVirtualLaunchTarget(registry, launchTarget);
  if (model !== undefined) {
    yield* setVirtualConfigOption(registry, { configId: 'model', launchTarget, type: 'select', value: model });
  }
  if (draft !== undefined) {
    yield* editVirtual(registry, { draft });
  }
  setPhase(registry, launchTarget, 'ready');
});

/** {@link seedUnbound}, then a real Bind against the fake agent (Codex: `bound-1`); `calls` is reset afterwards. */
const seedBound = Effect.fnUntraced(function* (registry: Registry, calls: string[], opts: SeedOpts = {}) {
  yield* seedUnbound(registry, opts);
  yield* bindVirtualOnUsable(registry, opts.launchTarget ?? CODEX);
  calls.length = 0;
});

/** A `prompt` for {@link sendVirtual} that records `prompt:<id>` into `calls` and keeps what it was handed. */
const recordingPrompt = (calls: string[]) => {
  const prompted: MaterializedVirtual[] = [];
  return {
    prompt: (materialized: MaterializedVirtual) =>
      Effect.sync(() => {
        calls.push(`prompt:${materialized.sessionId}`);
        prompted.push(materialized);
      }),
    prompted,
  };
};

describe('ensure / edits', () => {
  it.effect('ensure creates an empty blob and Selects Virtual', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;

      yield* ensureVirtual(registry);

      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
      assert.deepStrictEqual(blob(registry), {
        attachments: [],
        configValues: {},
        cwd: undefined,
        draft: '',
        id: blob(registry)?.id ?? '',
        launchTarget: undefined,
      });
      assert.isString(blob(registry)?.id);
    }).pipe(Effect.scoped),
  );

  it.effect('Create while Selected Virtual is a no-op; cwd-group (+) patches the cwd', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      yield* ensureVirtual(registry, { cwd: '/a' });
      yield* editVirtual(registry, { draft: 'hello' });

      yield* ensureVirtual(registry, { cwd: '/b' });
      assert.strictEqual(blob(registry)?.cwd, '/a');
      assert.strictEqual(blob(registry)?.draft, 'hello');

      yield* ensureVirtual(registry, { cwd: '/b', patchCwdIfSelectedVirtual: true });
      assert.strictEqual(blob(registry)?.cwd, '/b');
    }).pipe(Effect.scoped),
  );

  it.effect('re-Selecting keeps the existing blob; a new folder re-points it (folder churn)', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      yield* ensureVirtual(registry, { cwd: '/proj' });
      yield* editVirtual(registry, { draft: 'd' });
      yield* select(registry, { _tag: 'Session', sessionId: 's1' });

      yield* ensureVirtual(registry);
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
      assert.strictEqual(blob(registry)?.cwd, '/proj');

      yield* select(registry, { _tag: 'Session', sessionId: 's1' });
      yield* ensureVirtual(registry, { cwd: '/new', patchCwdIfSelectedVirtual: true });
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
      assert.strictEqual(blob(registry)?.cwd, '/new');
      assert.strictEqual(blob(registry)?.draft, 'd');
    }).pipe(Effect.scoped),
  );

  it.effect('a new blob seeds from last-create defaults', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      registry.set(lastCreateDefaultsAtom, {
        configValues: { mode: 'default', model: 'sonnet' },
        launchTarget: CLAUDE,
      });

      yield* ensureVirtual(registry);

      assert.strictEqual(blob(registry)?.launchTarget, CLAUDE);
      assert.strictEqual(blob(registry)?.configValues.model, 'sonnet');
    }).pipe(Effect.scoped),
  );

  it.effect('a launch target change keeps draft + cwd and prefers last-create defaults for that target', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      registry.set(configOptionIndexAtom(CODEX), {
        byModel: {
          gpt: [
            { choices: [{ id: 'gpt', name: 'gpt' }], currentValue: 'gpt', id: 'model', name: 'Model', type: 'select' },
          ],
        },
        defaultModelId: 'gpt',
        unavailableModelIds: [],
      });
      registry.set(lastCreateDefaultsAtom, { configValues: { effort: 'high', model: 'gpt' }, launchTarget: CODEX });
      yield* ensureVirtual(registry, { cwd: '/proj' });
      yield* setVirtualLaunchTarget(registry, CLAUDE);
      yield* setVirtualConfigOption(registry, { configId: 'model', launchTarget: CLAUDE, type: 'select', value: 'x' });
      yield* editVirtual(registry, { draft: 'keep me' });

      yield* setVirtualLaunchTarget(registry, CODEX);

      const virtual = blob(registry);
      assert.strictEqual(virtual?.draft, 'keep me');
      assert.strictEqual(virtual?.cwd, '/proj');
      assert.strictEqual(virtual?.launchTarget, CODEX);
      assert.strictEqual(virtual?.configValues.model, 'gpt');
    }).pipe(Effect.scoped),
  );

  const twoModels = (): ConfigOptionIndex => {
    const row = (current: string) => [
      {
        choices: [
          { id: 'sonnet', name: 'sonnet' },
          { id: 'opus', name: 'opus' },
        ],
        currentValue: current,
        id: 'model',
        name: 'Model',
        type: 'select' as const,
      },
    ];
    return { byModel: { opus: row('opus'), sonnet: row('sonnet') }, defaultModelId: 'sonnet', unavailableModelIds: [] };
  };
  const hideSonnet = (registry: Registry, launchTarget: AgentLaunchTarget) => {
    registry.set(
      userSettingsDocumentAtom,
      AsyncResult.success({
        ...defaultSettings,
        hiddenModels: { [launchTarget]: ['sonnet'] },
        providerEnabled: { [CLAUDE]: true, [CODEX]: true },
      }),
    );
  };

  it.effect('a new Virtual on another provider starts on a shown model when the default is Hidden', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      registry.set(configOptionIndexAtom(CODEX), twoModels());
      hideSonnet(registry, CODEX);
      yield* ensureVirtual(registry, { cwd: '/proj' });

      yield* setVirtualLaunchTarget(registry, CODEX);

      assert.strictEqual(blob(registry)?.configValues.model, 'opus');
    }).pipe(Effect.scoped),
  );

  it.effect('a last-create default naming a Hidden model is not reused', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      registry.set(configOptionIndexAtom(CODEX), twoModels());
      registry.set(lastCreateDefaultsAtom, { configValues: { model: 'sonnet' }, launchTarget: CODEX });
      hideSonnet(registry, CODEX);

      yield* ensureVirtual(registry);

      assert.strictEqual(blob(registry)?.configValues.model, 'opus');
    }).pipe(Effect.scoped),
  );

  it.effect('a launch target change to a disabled provider fails with ProviderUnavailable and changes nothing', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      enableProviders(registry, [CODEX]);
      yield* ensureVirtual(registry, { cwd: '/proj' });

      const exit = yield* Effect.exit(setVirtualLaunchTarget(registry, CLAUDE));

      assert.isTrue(Exit.isFailure(exit));
      assert.isUndefined(blob(registry)?.launchTarget);
    }).pipe(Effect.scoped),
  );
});

describe('Bind', () => {
  it.effect(
    'cwd + launch target + usable Binds once: Bound id on the blob, sessions map row, no History, active for `@`',
    () =>
      Effect.gen(function* () {
        const calls: string[] = [];
        yield* installFakeAgent(calls);
        const registry = yield* freshRegistry;
        yield* seedUnbound(registry);

        yield* bindVirtualOnUsable(registry, CODEX);

        assert.deepStrictEqual(calls, ['new']);
        assert.strictEqual(blob(registry)?.sessionId, 'bound-1');
        assert.strictEqual(sessionsOf(registry)['bound-1'].status, 'active');
        assert.strictEqual(registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory.length, 0);
        // The `@` FS listing keys off the active session (Bound Virtual), not the Session-arm Selected.
        assert.deepStrictEqual(registry.get(selectedActiveSessionAtom), {
          cwd: '/proj',
          launchTarget: CODEX,
          sessionId: 'bound-1',
        });

        yield* bindVirtualOnUsable(registry, CODEX);
        assert.deepStrictEqual(calls, ['new']);
      }).pipe(Effect.scoped),
  );

  it.effect('usable (probe not done) still Binds; a list that landed first has its Bound id dropped', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry);
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        phase: 'usable',
        sessionHistory: normalizeSessionHistory({
          sessions: [
            { cwd: '/proj', sessionId: 'bound-1' },
            { cwd: '/proj', sessionId: 'other' },
          ],
        }),
      }));

      yield* bindVirtualOnUsable(registry, CODEX);

      assert.deepStrictEqual(calls, ['new']);
      assert.deepStrictEqual(
        registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory.map(entry => entry.sessionId),
        ['other'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('a failed Bind leaves the blob unbound', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls, { failNew: true });
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry);

      yield* bindVirtualOnUsable(registry, CODEX);

      assert.deepStrictEqual(calls, ['new']);
      assert.isUndefined(blob(registry)?.sessionId);
      assert.deepStrictEqual(sessionsOf(registry), {});
    }).pipe(Effect.scoped),
  );

  it.effect('Bind does not apply the Virtual Config', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry, { model: 'o1' });

      yield* bindVirtualOnUsable(registry, CODEX);

      assert.deepStrictEqual(calls, ['new']);
      assert.strictEqual(blob(registry)?.configValues.model, 'o1');
      assert.strictEqual(configValue(sessionsOf(registry)['bound-1'].configuration, 'model'), 'gpt');
    }).pipe(Effect.scoped),
  );

  it.effect('draft, attachment and Config edits never Bind', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      // Unbound and ready with no Bind in flight: any Bind request here would reach `session/new`.
      yield* seedUnbound(registry);

      yield* editVirtual(registry, { draft: 'hello' });
      yield* editVirtual(registry, { attachments: [] });
      yield* setVirtualConfigOption(registry, { configId: 'model', launchTarget: CODEX, type: 'select', value: 'o1' });
      yield* Effect.yieldNow;

      assert.deepStrictEqual(calls, []);
      assert.isUndefined(blob(registry)?.sessionId);
      assert.deepStrictEqual(sessionsOf(registry), {});
    }).pipe(Effect.scoped),
  );

  it.effect('a cwd change tears down the Bound session and rebinds in the new cwd', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedBound(registry, calls);

      yield* editVirtual(registry, { cwd: '/other' });
      yield* bindVirtualOnUsable(registry, CODEX);
      yield* Effect.yieldNow;

      assert.sameMembers(calls, ['close:bound-1', 'delete:bound-1', 'new']);
      assert.strictEqual(blob(registry)?.sessionId, 'bound-2');
      assert.deepStrictEqual(Object.keys(sessionsOf(registry)), ['bound-2']);
      assert.strictEqual(sessionsOf(registry)['bound-2'].cwd, '/other');
    }).pipe(Effect.scoped),
  );

  it.effect(
    'a launch target change tears down the old session and Binds the new provider; draft kept, Config reset',
    () =>
      Effect.gen(function* () {
        const calls: string[] = [];
        yield* installFakeAgent(calls);
        yield* installFakeAgent(calls, {}, CLAUDE);
        const registry = yield* freshRegistry;
        setPhase(registry, CLAUDE, 'ready');
        yield* seedBound(registry, calls, { draft: 'keep me', model: 'o1' });
        const id = blob(registry)?.id ?? '';

        yield* setVirtualLaunchTarget(registry, CLAUDE);
        yield* bindVirtualOnUsable(registry, CLAUDE);
        yield* Effect.yieldNow;

        assert.sameMembers(calls, ['close:bound-1', 'delete:bound-1', 'new:claude']);
        assert.deepStrictEqual(blob(registry), {
          attachments: [],
          configValues: {},
          cwd: '/proj',
          draft: 'keep me',
          id,
          launchTarget: CLAUDE,
          sessionId: 'claude-1',
        });
      }).pipe(Effect.scoped),
  );

  it.effect('a failed delete of the old session does not block the replacement Bind', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls, { failDelete: true });
      const registry = yield* freshRegistry;
      yield* seedBound(registry, calls);

      yield* editVirtual(registry, { cwd: '/other' });
      yield* bindVirtualOnUsable(registry, CODEX);
      yield* Effect.yieldNow;

      assert.include(calls, 'delete:bound-1');
      assert.strictEqual(blob(registry)?.sessionId, 'bound-2');
    }).pipe(Effect.scoped),
  );
});

describe('latest-wins Bind', () => {
  it.effect('a provider switch mid-Bind is accepted without the Lifecycle lock; the stale session is torn down', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      let lockDuringBind: boolean | undefined;
      yield* installFakeAgent(calls, {
        duringNew: onlyFirst(
          Effect.gen(function* () {
            lockDuringBind = registry.get(virtualMaterializingAtom);
            yield* Effect.orDie(setVirtualLaunchTarget(registry, CLAUDE));
          }),
        ),
      });
      yield* installFakeAgent(calls, {}, CLAUDE);
      setPhase(registry, CLAUDE, 'ready');
      yield* seedUnbound(registry);

      yield* bindVirtualOnUsable(registry, CODEX);

      assert.isFalse(lockDuringBind);
      assert.strictEqual(blob(registry)?.launchTarget, CLAUDE);
      assert.strictEqual(blob(registry)?.sessionId, 'claude-1');
      assert.include(calls, 'delete:bound-1');
      assert.notProperty(sessionsOf(registry), 'bound-1');
    }).pipe(Effect.scoped),
  );

  it.effect('a rapid A-B-A switch leaves one live Bound session for A; the others are torn down', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      yield* installFakeAgent(calls, {
        duringNew: onlyFirst(
          Effect.orDie(
            Effect.gen(function* () {
              yield* Effect.orDie(setVirtualLaunchTarget(registry, CLAUDE));
              yield* setVirtualLaunchTarget(registry, CODEX);
            }),
          ),
        ),
      });
      yield* installFakeAgent(calls, {}, CLAUDE);
      setPhase(registry, CLAUDE, 'ready');
      yield* seedUnbound(registry);

      yield* bindVirtualOnUsable(registry, CODEX);

      assert.strictEqual(blob(registry)?.launchTarget, CODEX);
      assert.strictEqual(blob(registry)?.sessionId, 'bound-2');
      assert.deepStrictEqual(Object.keys(sessionsOf(registry)), ['bound-2']);
      assert.deepStrictEqual(Object.keys(sessionsOf(registry, CLAUDE)), []);
      assert.include(calls, 'delete:bound-1');
      assert.include(calls, 'delete:claude-1');
    }).pipe(Effect.scoped),
  );

  it.effect('a teardown failure of the superseded session does not block the replacement Bind', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      yield* installFakeAgent(calls, {
        duringNew: onlyFirst(editVirtual(registry, { cwd: '/other' })),
        failDelete: true,
      });
      yield* seedUnbound(registry);

      yield* bindVirtualOnUsable(registry, CODEX);

      assert.include(calls, 'delete:bound-1');
      assert.strictEqual(blob(registry)?.cwd, '/other');
      assert.strictEqual(blob(registry)?.sessionId, 'bound-2');
    }).pipe(Effect.scoped),
  );

  it.effect('a same-key request while a Bind is in flight joins it (one session/new)', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      yield* installFakeAgent(calls, { duringNew: onlyFirst(ensureVirtual(registry)) });
      yield* seedUnbound(registry);

      yield* bindVirtualOnUsable(registry, CODEX);

      assert.deepStrictEqual(calls, ['new']);
      assert.strictEqual(blob(registry)?.sessionId, 'bound-1');
    }).pipe(Effect.scoped),
  );
});

describe('Leaving Virtual', () => {
  it.effect('with an empty Composer, Selecting a Session discards the blob and tears down its Bound session', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedBound(registry, calls);

      yield* select(registry, { _tag: 'Session', sessionId: 'real-1' });
      yield* Effect.yieldNow;

      assert.deepStrictEqual(calls, ['close:bound-1', 'delete:bound-1']);
      assert.isNull(blob(registry));
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
    }).pipe(Effect.scoped),
  );

  it.effect('with an empty Composer, clearing Selected discards the blob without a History row', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedBound(registry, calls);

      yield* select(registry, undefined);
      yield* Effect.yieldNow;

      assert.deepStrictEqual(calls, ['close:bound-1', 'delete:bound-1']);
      assert.isNull(blob(registry));
      assert.isUndefined(registry.get(selectedAtom));
      assert.strictEqual(registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory.length, 0);
    }).pipe(Effect.scoped),
  );

  it.effect('with Composer content the blob and its Bound session are kept', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedBound(registry, calls, { draft: 'half-typed' });

      yield* select(registry, { _tag: 'Session', sessionId: 'real-1' });
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
      yield* ensureVirtual(registry);
      yield* select(registry, undefined);
      yield* Effect.yieldNow;

      assert.deepStrictEqual(calls, []);
      assert.strictEqual(blob(registry)?.draft, 'half-typed');
      assert.strictEqual(blob(registry)?.sessionId, 'bound-1');
      assert.isUndefined(registry.get(selectedAtom));
    }).pipe(Effect.scoped),
  );

  it.effect('mid-Bind with an empty Composer: Selected flips and the orphan is torn down when session/new lands', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      yield* installFakeAgent(calls, { duringNew: select(registry, { _tag: 'Session', sessionId: 'real-1' }) });
      yield* seedUnbound(registry);

      yield* bindVirtualOnUsable(registry, CODEX);

      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
      assert.isNull(blob(registry));
      assert.include(calls, 'delete:bound-1');
      assert.notProperty(sessionsOf(registry), 'bound-1');
    }).pipe(Effect.scoped),
  );

  it.effect('mid-Bind with Composer content: Selected flips and the Bind finishes onto the kept blob', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      yield* installFakeAgent(calls, { duringNew: select(registry, { _tag: 'Session', sessionId: 'real-1' }) });
      yield* seedUnbound(registry, { draft: 'half-typed' });

      yield* bindVirtualOnUsable(registry, CODEX);

      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
      assert.strictEqual(blob(registry)?.sessionId, 'bound-1');
      assert.strictEqual(blob(registry)?.draft, 'half-typed');
      assert.isFalse(calls.some(call => call.startsWith('delete:')));
    }).pipe(Effect.scoped),
  );

  it.effect('discarding (Workspace folder gone) drops a blob with content and tears down its Bound session', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedBound(registry, calls, { draft: 'half-typed' });

      yield* discardVirtual(registry);
      yield* Effect.yieldNow;

      assert.deepStrictEqual(calls, ['close:bound-1', 'delete:bound-1']);
      assert.isNull(blob(registry));
      assert.isUndefined(registry.get(selectedAtom));
    }).pipe(Effect.scoped),
  );
});

describe('Send', () => {
  it.effect(
    'Bound: Materializes without a second session/new, adds the History row, Selects the Session, prompts',
    () =>
      Effect.gen(function* () {
        const calls: string[] = [];
        yield* installFakeAgent(calls);
        const registry = yield* freshRegistry;
        yield* seedBound(registry, calls, { draft: 'hello world' });
        const recorder = recordingPrompt(calls);

        yield* sendVirtual(registry, recorder.prompt);

        assert.deepStrictEqual(calls, ['prompt:bound-1']);
        assert.deepStrictEqual(recorder.prompted, [
          { attachments: [], draft: 'hello world', launchTarget: CODEX, sessionId: 'bound-1' },
        ]);
        assert.isNull(blob(registry));
        assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
        assert.deepStrictEqual(
          registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory.map(entry => entry.sessionId),
          ['bound-1'],
        );
        assert.deepStrictEqual(registry.get(lastCreateDefaultsAtom), { configValues: {}, launchTarget: CODEX });
        assert.isFalse(registry.get(virtualSendPendingAtom));
        assert.isFalse(registry.get(virtualMaterializingAtom));

        // The Lifecycle lock is released: the next Create works.
        yield* ensureVirtual(registry, { cwd: '/proj' });
        assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
        assert.strictEqual(blob(registry)?.cwd, '/proj');
      }).pipe(Effect.scoped),
  );

  it.effect('Config diffs are applied to the Bound session before the prompt', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedBound(registry, calls, { draft: 'hello', model: 'o1' });

      yield* sendVirtual(registry, recordingPrompt(calls).prompt);

      assert.deepStrictEqual(calls, ['set:model:o1', 'prompt:bound-1']);
    }).pipe(Effect.scoped),
  );

  it.effect('a session/update landing during the Config diffs survives Materialize', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      const fold = makeHarnessEventFold({
        launchTarget: CODEX,
        registry,
        runFork: () => undefined,
      });
      yield* installFakeAgent(calls, {
        duringSetConfig: Effect.sync(() => {
          fold.onSessionUpdate('bound-1', {
            availableCommands: [{ description: 'Review the diff', isSkill: false, name: 'review' }],
            sessionUpdate: 'available_commands_update',
          });
        }),
      });
      yield* seedBound(registry, calls, { draft: 'hello', model: 'o1' });

      yield* sendVirtual(registry, recordingPrompt(calls).prompt);

      assert.deepStrictEqual(calls, ['set:model:o1', 'prompt:bound-1']);
      assert.deepStrictEqual(sessionsOf(registry)['bound-1'].availableCommands, [
        { description: 'Review the diff', isSkill: false, name: 'review' },
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect('Send pending covers Materialize, and edits are inert while the Lifecycle lock is held', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      const during: { draft?: string; locked?: boolean; pending?: boolean } = {};
      yield* installFakeAgent(calls, {
        duringSetConfig: Effect.gen(function* () {
          yield* editVirtual(registry, { draft: 'changed' });
          during.draft = blob(registry)?.draft;
          during.locked = registry.get(virtualMaterializingAtom);
          during.pending = registry.get(virtualSendPendingAtom);
        }),
      });
      yield* seedBound(registry, calls, { draft: 'hello', model: 'o1' });
      const recorder = recordingPrompt(calls);

      yield* sendVirtual(registry, recorder.prompt);

      assert.deepStrictEqual(during, { draft: 'hello', locked: true, pending: true });
      assert.strictEqual(recorder.prompted[0]?.draft, 'hello');
    }).pipe(Effect.scoped),
  );

  it.effect('a draft update from the latest blob is inert while the Lifecycle lock is held, and with no blob', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      const during: { draft?: string; locked?: boolean } = {};
      yield* installFakeAgent(calls, {
        duringSetConfig: Effect.sync(() => {
          updateVirtualDraft(registry, blob(registry)?.id, () => ({ draft: 'changed' }));
          during.draft = blob(registry)?.draft;
          during.locked = registry.get(virtualMaterializingAtom);
        }),
      });
      yield* seedBound(registry, calls, { draft: 'hello', model: 'o1' });
      const recorder = recordingPrompt(calls);

      yield* sendVirtual(registry, recorder.prompt);

      assert.deepStrictEqual(during, { draft: 'hello', locked: true });
      assert.strictEqual(recorder.prompted[0]?.draft, 'hello');
      assert.isNull(blob(registry));
      updateVirtualDraft(registry, blob(registry)?.id, () => ({ draft: 'changed' }));
      assert.isNull(blob(registry));
    }).pipe(Effect.scoped),
  );

  it.effect('ensure, launch target change and discard are inert while the Lifecycle lock is held', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      const during: { blob?: ReturnType<typeof blob>; selected?: unknown } = {};
      yield* installFakeAgent(calls, {
        duringSetConfig: Effect.gen(function* () {
          yield* ensureVirtual(registry, { cwd: '/other', patchCwdIfSelectedVirtual: true });
          yield* Effect.orDie(setVirtualLaunchTarget(registry, CLAUDE));
          yield* discardVirtual(registry);
          during.blob = blob(registry);
          during.selected = registry.get(selectedAtom);
        }),
      });
      setPhase(registry, CLAUDE, 'ready');
      yield* seedBound(registry, calls, { draft: 'hello', model: 'o1' });

      yield* sendVirtual(registry, recordingPrompt(calls).prompt);

      assert.strictEqual(during.blob?.cwd, '/proj');
      assert.strictEqual(during.blob?.launchTarget, CODEX);
      assert.strictEqual(during.blob?.sessionId, 'bound-1');
      assert.deepStrictEqual(during.selected, { _tag: 'Virtual' });
      assert.deepStrictEqual(calls, ['set:model:o1', 'prompt:bound-1']);
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
    }).pipe(Effect.scoped),
  );

  it.effect('navigating away mid-Materialize keeps Selected; the prompt still goes to the promoted Session', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const registry = yield* freshRegistry;
      yield* installFakeAgent(calls, { duringSetConfig: select(registry, { _tag: 'Session', sessionId: 'real-1' }) });
      yield* seedBound(registry, calls, { draft: 'hello', model: 'o1' });

      yield* sendVirtual(registry, recordingPrompt(calls).prompt);

      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'real-1' });
      assert.isNull(blob(registry));
      assert.include(calls, 'prompt:bound-1');
      assert.isFalse(calls.some(call => call.startsWith('delete:')));
      assert.deepStrictEqual(
        registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory.map(entry => entry.sessionId),
        ['bound-1'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('unbound with no Bind in flight: requests a Bind itself, then sends', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry, { draft: 'hello' });

      yield* sendVirtual(registry, recordingPrompt(calls).prompt);

      assert.deepStrictEqual(calls, ['new', 'prompt:bound-1']);
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
    }).pipe(Effect.scoped),
  );

  it.effect('mid-Bind: Send pending with the draft kept until the Bind lands, then Materializes and prompts it', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* gated;
      yield* installFakeAgent(calls, { duringNew: gate.during });
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry, { draft: 'hello' });
      const binding = yield* Effect.forkChild(bindVirtualOnUsable(registry, CODEX));
      yield* gate.started;

      const send = yield* Effect.forkChild(sendVirtual(registry, recordingPrompt(calls).prompt));
      yield* Effect.yieldNow;
      assert.deepStrictEqual(calls, ['new']);
      assert.isTrue(registry.get(virtualSendPendingAtom));
      assert.strictEqual(blob(registry)?.draft, 'hello');

      yield* gate.release;
      yield* Fiber.join(send);
      yield* Fiber.join(binding);

      assert.deepStrictEqual(calls, ['new', 'prompt:bound-1']);
      assert.isFalse(registry.get(virtualSendPendingAtom));
      assert.isNull(blob(registry));
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
    }).pipe(Effect.scoped),
  );

  it.effect('waits for the provider to become usable', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry, { draft: 'hello' });
      setPhase(registry, CODEX, 'connecting');

      const send = yield* Effect.forkChild(sendVirtual(registry, recordingPrompt(calls).prompt));
      yield* Effect.yieldNow;
      assert.deepStrictEqual(calls, []);
      assert.isTrue(registry.get(virtualSendPendingAtom));

      setPhase(registry, CODEX, 'usable');
      yield* Fiber.join(send);

      assert.deepStrictEqual(calls, ['new', 'prompt:bound-1']);
    }).pipe(Effect.scoped),
  );

  it.effect('a provider ending in error fails with ProviderUnavailable; draft kept, still Virtual, not pending', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry, { draft: 'hello' });
      setPhase(registry, CODEX, 'connecting');

      const send = yield* Effect.forkChild(Effect.exit(sendVirtual(registry, recordingPrompt(calls).prompt)));
      yield* Effect.yieldNow;
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        failure: { _tag: 'Failed', message: 'boom' },
        phase: 'error',
      }));
      const exit = yield* Fiber.join(send);

      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(calls, []);
      assert.strictEqual(blob(registry)?.draft, 'hello');
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
      assert.isFalse(registry.get(virtualSendPendingAtom));
    }).pipe(Effect.scoped),
  );

  it.effect('a failed Bind fails with ProviderUnavailable; draft kept, no prompt, not pending', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls, { failNew: true });
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry, { draft: 'hello' });

      const exit = yield* Effect.exit(sendVirtual(registry, recordingPrompt(calls).prompt));

      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(calls, ['new']);
      assert.strictEqual(blob(registry)?.draft, 'hello');
      assert.isFalse(registry.get(virtualSendPendingAtom));
    }).pipe(Effect.scoped),
  );

  it.effect('a draft cleared while awaiting the Bind sends nothing', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* gated;
      yield* installFakeAgent(calls, { duringNew: gate.during });
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry, { draft: 'hello' });
      const recorder = recordingPrompt(calls);

      const send = yield* Effect.forkChild(sendVirtual(registry, recorder.prompt));
      yield* gate.started;
      yield* editVirtual(registry, { draft: '' });
      yield* gate.release;
      yield* Fiber.join(send);

      assert.deepStrictEqual(recorder.prompted, []);
      assert.strictEqual(blob(registry)?.sessionId, 'bound-1');
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
    }).pipe(Effect.scoped),
  );

  it.effect('a cwd change while awaiting follows the newest Bind', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* gated;
      yield* installFakeAgent(calls, { duringNew: gate.during });
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry, { draft: 'hello' });

      const send = yield* Effect.forkChild(sendVirtual(registry, recordingPrompt(calls).prompt));
      yield* gate.started;
      yield* editVirtual(registry, { cwd: '/other' });
      yield* gate.release;
      yield* Fiber.join(send);

      assert.include(calls, 'prompt:bound-2');
      assert.include(calls, 'delete:bound-1');
      assert.strictEqual(sessionsOf(registry)['bound-2'].cwd, '/other');
    }).pipe(Effect.scoped),
  );

  it.effect('a provider switch while awaiting follows the latest Bind and prompts the new provider', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* gated;
      yield* installFakeAgent(calls, { duringNew: gate.during });
      yield* installFakeAgent(calls, {}, CLAUDE);
      const registry = yield* freshRegistry;
      setPhase(registry, CLAUDE, 'ready');
      yield* seedUnbound(registry, { draft: 'hello' });

      const send = yield* Effect.forkChild(sendVirtual(registry, recordingPrompt(calls).prompt));
      yield* gate.started;
      yield* setVirtualLaunchTarget(registry, CLAUDE);
      yield* gate.release;
      yield* Fiber.join(send);

      assert.include(calls, 'prompt:claude-1');
      assert.notInclude(calls, 'prompt:bound-1');
      assert.include(calls, 'delete:bound-1');
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'claude-1' });
    }).pipe(Effect.scoped),
  );

  it.effect('a second Send while one is pending is ignored (one prompt)', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* gated;
      yield* installFakeAgent(calls, { duringNew: gate.during });
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry, { draft: 'hello' });
      const recorder = recordingPrompt(calls);

      const first = yield* Effect.forkChild(sendVirtual(registry, recorder.prompt));
      yield* gate.started;
      yield* sendVirtual(registry, recorder.prompt);
      yield* gate.release;
      yield* Fiber.join(first);

      assert.deepStrictEqual(calls, ['new', 'prompt:bound-1']);
    }).pipe(Effect.scoped),
  );
});

/** Bound Virtual on a live session whose `model` reports `liveModel` (or unbound), then select `o1`. */
const selectO1OnVirtual = (liveModel: string | undefined) =>
  Effect.gen(function* () {
    const calls: string[] = [];
    yield* installFakeAgent(calls);
    const registry = yield* freshRegistry;
    if (liveModel === undefined) {
      yield* seedUnbound(registry, { model: 'gpt' });
    } else {
      yield* seedBound(registry, calls, { model: 'gpt' });
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessions: {
          ...current.sessions,
          'bound-1': {
            ...current.sessions['bound-1'],
            configuration: normalizeConfigOptions({
              configOptions: [{ ...selectableConfig.configOptions[0], currentValue: liveModel }],
            }),
          },
        },
      }));
    }
    const liveBefore = sessionsOf(registry)['bound-1'];

    yield* setVirtualConfigOption(registry, { configId: 'model', launchTarget: CODEX, type: 'select', value: 'o1' });

    assert.deepStrictEqual(calls, []);
    assert.strictEqual(blob(registry)?.configValues.model, 'o1');
    assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
    assert.strictEqual(sessionsOf(registry)['bound-1'], liveBefore);
  }).pipe(Effect.scoped);

/** Index whose default row advertises `gpt` and `o1`; only `gpt` is hydrated. */
const advertisedO1Index: ConfigOptionIndex = {
  byModel: {
    gpt: [
      {
        choices: [
          { id: 'gpt', name: 'gpt' },
          { id: 'o1', name: 'o1' },
        ],
        currentValue: 'gpt',
        id: 'model',
        name: 'Model',
        type: 'select',
      },
    ],
  },
  defaultModelId: 'gpt',
  unavailableModelIds: [],
};

describe('Config (blob only while Virtual)', () => {
  it.effect('matching the live Bound session: blob updated, no set_config_option, live unchanged (#217)', () =>
    selectO1OnVirtual('o1'),
  );

  it.effect('differing from the live Bound session: blob updated, no set_config_option', () =>
    selectO1OnVirtual('gpt'),
  );

  it.effect('unbound: blob updated, no RPC', () => selectO1OnVirtual(undefined));

  it.effect('Lazy hydrate: an advertised model with no row is picked on the Bound session, then written', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedBound(registry, calls);
      registry.set(configOptionIndexAtom(CODEX), advertisedO1Index);

      yield* setVirtualConfigOption(registry, { configId: 'model', launchTarget: CODEX, type: 'select', value: 'o1' });

      assert.deepStrictEqual(calls, ['set:model:o1']);
      assert.strictEqual(blob(registry)?.configValues.model, 'o1');
    }).pipe(Effect.scoped),
  );

  it.effect(
    'Lazy hydrate: the pick is recorded on the Bound session, so Materialize sets a later blob-only pick back',
    () =>
      Effect.gen(function* () {
        const calls: string[] = [];
        yield* installFakeAgent(calls);
        const registry = yield* freshRegistry;
        yield* seedBound(registry, calls, { draft: 'hello' });
        registry.set(configOptionIndexAtom(CODEX), advertisedO1Index);

        yield* setVirtualConfigOption(registry, {
          configId: 'model',
          launchTarget: CODEX,
          type: 'select',
          value: 'o1',
        });
        assert.deepStrictEqual(calls, ['set:model:o1']);
        assert.strictEqual(configValue(sessionsOf(registry)['bound-1'].configuration, 'model'), 'o1');

        // `gpt` has a row: blob only.
        yield* setVirtualConfigOption(registry, {
          configId: 'model',
          launchTarget: CODEX,
          type: 'select',
          value: 'gpt',
        });
        yield* sendVirtual(registry, recordingPrompt(calls).prompt);

        assert.deepStrictEqual(calls, ['set:model:o1', 'set:model:gpt', 'prompt:bound-1']);
      }).pipe(Effect.scoped),
  );

  it.effect('Lazy hydrate: a failed pick writes nothing', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls, { failSetConfig: true });
      const registry = yield* freshRegistry;
      yield* seedBound(registry, calls, { model: 'gpt' });
      registry.set(configOptionIndexAtom(CODEX), advertisedO1Index);

      yield* setVirtualConfigOption(registry, { configId: 'model', launchTarget: CODEX, type: 'select', value: 'o1' });

      assert.deepStrictEqual(calls, ['set:model:o1']);
      assert.strictEqual(blob(registry)?.configValues.model, 'gpt');
    }).pipe(Effect.scoped),
  );
});

describe('Provider hooks', () => {
  it.effect('a stopped provider unbinds the blob and drops its launch target and Config; the draft stays', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const registry = yield* freshRegistry;
      yield* seedBound(registry, calls, { draft: 'keep', model: 'o1' });

      resetVirtualOnProviderStopped(registry, CLAUDE);
      assert.strictEqual(blob(registry)?.sessionId, 'bound-1');

      const id = blob(registry)?.id ?? '';
      resetVirtualOnProviderStopped(registry, CODEX);
      assert.deepStrictEqual(blob(registry), {
        attachments: [],
        configValues: {},
        cwd: '/proj',
        draft: 'keep',
        id,
        launchTarget: undefined,
        sessionId: undefined,
      });
    }).pipe(Effect.scoped),
  );

  it.effect('an index publish resets Virtual Config values the index no longer offers', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      yield* seedUnbound(registry, { model: 'retired' });

      resetVirtualUnsupportedConfig(registry, CODEX, advertisedO1Index);

      assert.deepStrictEqual(blob(registry)?.configValues, { model: 'gpt' });
    }).pipe(Effect.scoped),
  );
});

/** Registry + real AtomFns (Virtual mutators and the Composer submit) on a mock host. Disposed when the scope closes. */
const atomFnHarness = Effect.gen(function* () {
  const registry = yield* freshRegistry;
  const runtime = createHostRuntime(mockHostLayer);
  const virtual = createVirtualSessionAtoms(runtime);
  const { submitComposerAtomFn } = createComposerAtoms(runtime);
  registry.mount(virtual.ensureVirtualSessionAtomFn);
  registry.mount(virtual.patchVirtualSessionAtomFn);
  registry.mount(virtual.setVirtualLaunchTargetAtomFn);
  registry.mount(submitComposerAtomFn);
  return { ...virtual, registry, submitComposerAtomFn };
});

/** Virtual on `/proj` + Codex, unbound with no Bind in flight, provider `ready` — seeded through the AtomFns. */
const seedUnboundViaAtomFns = Effect.fnUntraced(function* (h: Effect.Success<typeof atomFnHarness>) {
  setPhase(h.registry, CODEX, 'connecting');
  yield* runAtomFn(h.registry, h.ensureVirtualSessionAtomFn, { cwd: '/proj' });
  yield* runAtomFn(h.registry, h.setVirtualLaunchTargetAtomFn, CODEX);
  setPhase(h.registry, CODEX, 'ready');
});

describe('AtomFns', () => {
  it.effect('Send through the Composer submit reaches the agent via the Session-arm send', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const h = yield* atomFnHarness;
      yield* seedUnboundViaAtomFns(h);
      yield* runAtomFn(h.registry, h.patchVirtualSessionAtomFn, { draft: 'hello' });

      yield* runAtomFn(h.registry, h.submitComposerAtomFn, undefined);

      assert.deepStrictEqual(calls, ['new', 'prompt:bound-1']);
      assert.isNull(h.registry.get(virtualSessionAtom));
      assert.deepStrictEqual(h.registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
      const transcript = sessionsOf(h.registry)['bound-1'].transcript.items;
      assert.deepInclude(transcript[0], { kind: 'user_message', text: 'hello' });
    }).pipe(Effect.scoped),
  );

  it.effect('a draft edit while a cwd Bind is in flight does not drop the Bind (bug A)', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* gated;
      yield* installFakeAgent(calls, { duringNew: gate.during });
      const h = yield* atomFnHarness;
      yield* seedUnboundViaAtomFns(h);

      h.registry.set(h.patchVirtualSessionAtomFn, { cwd: '/other' });
      yield* gate.started;
      // Re-invoking the same AtomFn disposes the context the Bind was started from.
      yield* runAtomFn(h.registry, h.patchVirtualSessionAtomFn, { draft: 'hello' });
      yield* gate.release;
      yield* runAtomFn(h.registry, h.submitComposerAtomFn, undefined);

      assert.deepStrictEqual(calls, ['new', 'prompt:bound-1']);
      assert.deepStrictEqual(h.registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
    }).pipe(Effect.scoped),
  );

  it.effect('a second Send while one is pending leaves one prompt and a finished Materialize (bug B)', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* gated;
      const prompted = yield* Deferred.make<undefined>();
      yield* installFakeAgent(calls, { duringNew: gate.during, duringPrompt: Deferred.succeed(prompted, undefined) });
      const h = yield* atomFnHarness;
      yield* seedUnboundViaAtomFns(h);
      yield* runAtomFn(h.registry, h.patchVirtualSessionAtomFn, { draft: 'hello' });

      h.registry.set(h.submitComposerAtomFn, undefined);
      yield* gate.started;
      // Enter pressed again before React re-renders the Composer action (not awaited: the concurrent fn stays waiting).
      h.registry.set(h.submitComposerAtomFn, undefined);
      yield* Effect.yieldNow;
      yield* gate.release;
      yield* Deferred.await(prompted);

      assert.deepStrictEqual(calls, ['new', 'prompt:bound-1']);
      assert.isFalse(h.registry.get(virtualSendPendingAtom));
      assert.isNull(h.registry.get(virtualSessionAtom));
      assert.deepStrictEqual(h.registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
    }).pipe(Effect.scoped),
  );
});

/** Let every runnable fiber progress (no TestClock timeouts under `it.effect`). */
const settle = Effect.forEach(Array.from({ length: 50 }), () => Effect.yieldNow, { discard: true });

describe('#278 regressions', () => {
  it.effect('R1: Connection lost during Materialize keeps the draft and attachments, with no prompt', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const gate = yield* gated;
      const h = yield* atomFnHarness;
      const fold = makeHarnessEventFold({ launchTarget: CODEX, registry: h.registry, runFork: () => undefined });
      yield* installFakeAgent(calls, {
        reports: fold,
        setConfig: () => Effect.andThen(gate.during, Effect.fail('connection lost')),
      });
      const attachment = {
        byteLength: 1,
        id: 'a1',
        mimeType: 'image/png',
        name: 'a.png',
        previewDataUrl: 'data:image/png;base64,AA==',
        uri: 'file:///a.png',
      };
      yield* seedBound(h.registry, calls, { draft: 'hello', model: 'o1' });
      yield* editVirtual(h.registry, { attachments: [attachment] });

      h.registry.set(h.submitComposerAtomFn, undefined);
      yield* gate.started;
      fold.onConnectionLost();
      yield* gate.release;
      yield* settle;

      assert.isFalse(h.registry.get(virtualMaterializingAtom));
      assert.notInclude(calls, 'prompt:bound-1');
      assert.strictEqual(blob(h.registry)?.draft, 'hello');
      assert.deepStrictEqual(blob(h.registry)?.attachments, [attachment]);
    }).pipe(Effect.scoped),
  );

});
