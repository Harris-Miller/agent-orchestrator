import { assert, describe, it } from '@effect/vitest';
import { Cause, Effect, Exit, Fiber } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { initialSessionSnapshot, normalizeConfigOptions } from '../host/acpSessionBootstrap.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { configValue } from '../host/sessionConfiguration.ts';

import { configOptionIndexAtom } from './backendState.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { advertise, CODEX, freshRegistry, gated, installFakeAgent } from './fakeAgent.testing.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import type { HarnessEventFold } from './harnessEventFold.ts';
import { backendHarnessSnapshotAtom, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { applySessionConfigValues, SessionConfigUnavailable, setSessionConfigOption } from './sessionConfigChange.ts';

type Registry = AtomRegistry.AtomRegistry;

const target = { launchTarget: CODEX, sessionId: 's1' } as const;
const modelToO1 = { configId: 'model', type: 'select', value: 'o1' } as const;

/** The agent's raw `model` (gpt / o1 / gpt-5) and `mode` (default / plan) options. */
const report = (model: string, mode: string) => ({
  configOptions: [
    {
      currentValue: model,
      id: 'model',
      name: 'Model',
      options: [
        { name: 'gpt', value: 'gpt' },
        { name: 'o1', value: 'o1' },
        { name: 'gpt-5', value: 'gpt-5' },
      ],
      type: 'select',
    },
    {
      currentValue: mode,
      id: 'mode',
      name: 'Mode',
      options: [
        { name: 'Default', value: 'default' },
        { name: 'Plan', value: 'plan' },
      ],
      type: 'select',
    },
  ],
});

const configUpdate = (configOptions: unknown) => ({ configOptions, sessionUpdate: 'config_option_update' });

/**
 * Bootstrap `ready`, an active Session `s1` at model `gpt` / mode `default`, and a fake agent reporting to the real
 * Harness event fold. `opts` may use the fold (to deliver agent reports mid-RPC) and the registry.
 */
const setup = Effect.fnUntraced(function* (
  opts: (h: { readonly fold: HarnessEventFold; readonly registry: Registry }) => FakeAgentOpts = () => ({}),
) {
  const registry = yield* freshRegistry;
  advertise(registry, CODEX, {});
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessions: {
      s1: {
        ...initialSessionSnapshot('s1', 'active'),
        configuration: normalizeConfigOptions(report('gpt', 'default')),
      },
    },
  }));
  const fold = makeHarnessEventFold({
    launchTarget: CODEX,
    refreshFsListing: () => Effect.void,
    registry,
    runFork: () => undefined,
  });
  const calls: string[] = [];
  yield* installFakeAgent(calls, { ...opts({ fold, registry }), reports: fold });
  const snapshot = () => registry.get(backendHarnessSnapshotAtom(CODEX));
  const s1 = () => snapshot().sessions.s1;
  return { calls, fold, registry, s1, snapshot };
});

describe('setSessionConfigOption (Config change)', () => {
  it.effect('shows the value and the Pending client request while in flight, then folds the response', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* setup(() => ({
        setConfig: (_configId, value) => Effect.as(gate.during, report(String(value), 'default')),
      }));

      const change = yield* Effect.forkChild(setSessionConfigOption(h.registry, target, modelToO1));
      yield* gate.started;
      assert.strictEqual(configValue(h.s1().configuration, 'model'), 'o1');
      assert.strictEqual(h.s1().pendingClientRequest, 'config');

      yield* gate.release;
      yield* Fiber.join(change);

      assert.deepStrictEqual(h.calls, ['set:model:o1']);
      assert.strictEqual(configValue(h.s1().configuration, 'model'), 'o1');
      assert.isUndefined(h.s1().pendingClientRequest);
    }).pipe(Effect.scoped),
  );

  it.effect('a failure keeps an agent report on another option that landed during the request', () =>
    Effect.gen(function* () {
      const h = yield* setup(({ fold }) => ({
        setConfig: () =>
          Effect.andThen(
            Effect.sync(() => {
              fold.onSessionUpdate('s1', configUpdate(report('gpt', 'plan').configOptions));
            }),
            Effect.fail('set-fail'),
          ),
      }));

      const error = yield* Effect.flip(setSessionConfigOption(h.registry, target, modelToO1));

      // The fake agent fails with a bare string, outside the RPC error type.
      assert.strictEqual<unknown>(error, 'set-fail');
      assert.strictEqual(configValue(h.s1().configuration, 'model'), 'gpt');
      assert.strictEqual(configValue(h.s1().configuration, 'mode'), 'plan');
      assert.isUndefined(h.s1().pendingClientRequest);
    }).pipe(Effect.scoped),
  );

  it.effect('a failure keeps a newer value the agent reported for the same option', () =>
    Effect.gen(function* () {
      const h = yield* setup(({ fold }) => ({
        setConfig: () =>
          Effect.andThen(
            Effect.sync(() => {
              fold.onSessionUpdate('s1', configUpdate(report('gpt-5', 'default').configOptions));
            }),
            Effect.fail('set-fail'),
          ),
      }));

      const error = yield* Effect.flip(setSessionConfigOption(h.registry, target, modelToO1));

      // The fake agent fails with a bare string, outside the RPC error type.
      assert.strictEqual<unknown>(error, 'set-fail');
      assert.strictEqual(configValue(h.s1().configuration, 'model'), 'gpt-5');
    }).pipe(Effect.scoped),
  );

  it.effect('a defect reverts the option and clears the Pending client request', () =>
    Effect.gen(function* () {
      const h = yield* setup(() => ({ setConfig: () => Effect.die('boom') }));

      const exit = yield* Effect.exit(setSessionConfigOption(h.registry, target, modelToO1));

      assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause));
      assert.strictEqual(configValue(h.s1().configuration, 'model'), 'gpt');
      assert.isUndefined(h.s1().pendingClientRequest);
    }).pipe(Effect.scoped),
  );

  it.effect('is refused with SessionConfigUnavailable, changing nothing, while a prompt is in flight', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      updateHarnessSnapshot(h.registry, CODEX, current => ({
        ...current,
        sessions: { s1: { ...current.sessions.s1, pendingClientRequest: 'prompt' } },
      }));
      const before = h.snapshot();

      const error = yield* Effect.flip(setSessionConfigOption(h.registry, target, modelToO1));

      assert.instanceOf(error, SessionConfigUnavailable);
      assert.strictEqual(h.snapshot(), before);
      assert.deepStrictEqual(h.calls, []);
    }).pipe(Effect.scoped),
  );

  it.effect('setting the current value sends nothing and changes nothing', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const before = h.snapshot();

      yield* setSessionConfigOption(h.registry, target, { configId: 'model', type: 'select', value: 'gpt' });

      assert.strictEqual(h.snapshot(), before);
      assert.deepStrictEqual(h.calls, []);
    }).pipe(Effect.scoped),
  );

  it.effect('a model the agent refuses is reverted and becomes an Unavailable model (Lazy hydrate)', () =>
    Effect.gen(function* () {
      const h = yield* setup(() => ({ setConfig: () => Effect.fail('refused') }));
      const index: ConfigOptionIndex = {
        byModel: { gpt: normalizeConfigOptions(report('gpt', 'default')) },
        defaultModelId: 'gpt',
        unavailableModelIds: [],
      };
      h.registry.set(configOptionIndexAtom(CODEX), index);

      const error = yield* Effect.flip(setSessionConfigOption(h.registry, target, modelToO1));

      // The fake agent fails with a bare string, outside the RPC error type.
      assert.strictEqual<unknown>(error, 'refused');
      assert.strictEqual(configValue(h.s1().configuration, 'model'), 'gpt');
      assert.deepStrictEqual(h.registry.get(configOptionIndexAtom(CODEX))?.unavailableModelIds, ['o1']);
    }).pipe(Effect.scoped),
  );

  it.effect('an interrupted change clears the Pending client request and keeps the value it showed', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* setup(() => ({ setConfig: () => gate.during }));

      const change = yield* Effect.forkChild(setSessionConfigOption(h.registry, target, modelToO1));
      yield* gate.started;
      assert.strictEqual(h.s1().pendingClientRequest, 'config');

      yield* Fiber.interrupt(change);

      assert.isUndefined(h.s1().pendingClientRequest);
      assert.isUndefined(h.s1().promptCancelRequested);
      assert.strictEqual(configValue(h.s1().configuration, 'model'), 'o1');
    }).pipe(Effect.scoped),
  );
});

describe('applySessionConfigValues (Config diffs)', () => {
  /** `model` (sonnet / opus) and an `effort` whose `high` choice exists only on opus. */
  const optionsFor = (model: string, effort = 'low') => [
    {
      currentValue: model,
      id: 'model',
      name: 'Model',
      options: [
        { name: 'Sonnet', value: 'sonnet' },
        { name: 'Opus', value: 'opus' },
      ],
      type: 'select',
    },
    {
      currentValue: effort,
      id: 'effort',
      name: 'Effort',
      options: model === 'opus' ? [{ value: 'low' }, { value: 'high' }] : [{ value: 'low' }],
      type: 'select',
    },
  ];

  it.effect('applies in order, recomputing after each set so a newly offered choice is applied', () =>
    Effect.gen(function* () {
      const h = yield* setup(() => ({
        setConfig: (configId, value) =>
          Effect.succeed({
            configOptions: configId === 'model' ? optionsFor(String(value)) : optionsFor('opus', String(value)),
          }),
      }));
      updateHarnessSnapshot(h.registry, CODEX, current => ({
        ...current,
        sessions: {
          s1: {
            ...current.sessions.s1,
            configuration: normalizeConfigOptions({ configOptions: optionsFor('sonnet') }),
          },
        },
      }));

      const result = yield* applySessionConfigValues(h.registry, target, { effort: 'high', model: 'opus' });

      assert.deepStrictEqual(result, { stoppedEarly: false });
      assert.deepStrictEqual(h.calls, ['set:model:opus', 'set:effort:high']);
      assert.strictEqual(configValue(h.s1().configuration, 'model'), 'opus');
      assert.strictEqual(configValue(h.s1().configuration, 'effort'), 'high');
    }).pipe(Effect.scoped),
  );

  it.effect('stops at the first failure and leaves the configuration as it was', () =>
    Effect.gen(function* () {
      const h = yield* setup(() => ({
        setConfig: configId => (configId === 'model' ? Effect.fail('set-fail') : Effect.succeed({})),
      }));
      const before = h.s1().configuration;

      const result = yield* applySessionConfigValues(h.registry, target, { mode: 'plan', model: 'o1' });

      assert.deepStrictEqual(result, { stoppedEarly: true });
      assert.deepStrictEqual(h.calls, ['set:model:o1']);
      assert.deepStrictEqual(h.s1().configuration, before);
    }).pipe(Effect.scoped),
  );

  it.effect('keeps a session/update that lands during a set', () =>
    Effect.gen(function* () {
      const h = yield* setup(({ fold }) => ({
        setConfig: () =>
          Effect.as(
            Effect.sync(() => {
              fold.onSessionUpdate('s1', {
                availableCommands: [{ name: 'review' }],
                sessionUpdate: 'available_commands_update',
              });
              fold.onSessionUpdate('s1', configUpdate(report('o1', 'plan').configOptions));
            }),
            report('o1', 'plan'),
          ),
      }));

      const result = yield* applySessionConfigValues(h.registry, target, { model: 'o1' });

      assert.deepStrictEqual(result, { stoppedEarly: false });
      assert.deepStrictEqual(h.s1().availableCommands, [{ description: undefined, name: 'review' }]);
      assert.strictEqual(configValue(h.s1().configuration, 'mode'), 'plan');
    }).pipe(Effect.scoped),
  );

  it.effect('a Session dropped during a set stops the loop and stays dropped', () =>
    Effect.gen(function* () {
      const h = yield* setup(({ registry }) => ({
        setConfig: () =>
          Effect.as(
            Effect.sync(() => {
              updateHarnessSnapshot(registry, CODEX, current => ({ ...current, sessions: {} }));
            }),
            report('o1', 'default'),
          ),
      }));

      const result = yield* applySessionConfigValues(h.registry, target, { model: 'o1' });

      assert.deepStrictEqual(result, { stoppedEarly: true });
      assert.isFalse('s1' in h.snapshot().sessions);
    }).pipe(Effect.scoped),
  );
});
