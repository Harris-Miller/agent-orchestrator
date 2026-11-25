/** Activation keeps a loaded Session's Config (the agent's load response wins); only an Unavailable model is reset (ADR-0016). */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { configValue } from '../host/sessionConfiguration.ts';

import { backendHarnessSnapshotAtom, configOptionIndexAtom } from './backendState.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { advertise, CODEX, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.testing.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

/** An index that does not know `gpt` (the fake `session/load` reports `gpt`); its default model is `o1`. */
const indexWithoutGpt: ConfigOptionIndex = {
  byModel: {
    o1: [{ choices: [{ id: 'o1', name: 'o1' }], currentValue: 'o1', id: 'model', name: 'Model', type: 'select' }],
  },
  defaultModelId: 'o1',
  unavailableModelIds: [],
};

/** An inactive Session `s1` in `/proj` (no transcript, so activation loads it), Bootstrap `ready`. */
const activate = Effect.fnUntraced(function* (fake: FakeAgentOpts = {}, index: ConfigOptionIndex = indexWithoutGpt) {
  const calls: string[] = [];
  const registry = yield* freshRegistry;
  yield* installFakeAgent(calls, fake);
  const runtime = createHostRuntime(mockHostLayer);
  const atoms = createSessionLifecycleAtoms(runtime, () => Effect.void);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [{ cwd: '/proj', sessionId: 's1' }],
    sessions: { s1: { ...initialSessionSnapshot('s1', 'inactive'), cwd: '/proj' } },
  }));
  advertise(registry, CODEX, {});
  registry.set(configOptionIndexAtom(CODEX), index);

  yield* runAtomFn(registry, atoms.activateSessionAtomFn, { launchTarget: CODEX, sessionId: 's1' });

  return { calls, s1: registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.s1 };
});

/** `gpt` is Unavailable; the default row is on `o1` while the provider recommends `o3`. */
const indexWithUnavailableGpt: ConfigOptionIndex = {
  byModel: {
    o1: [
      {
        choices: ['o1', 'o3', 'gpt'].map(id => ({ id, name: id })),
        currentValue: 'o1',
        id: 'model',
        name: 'Model',
        recommendedValue: 'o3',
        type: 'select',
      },
    ],
  },
  defaultModelId: 'o1',
  unavailableModelIds: ['gpt'],
};

describe('activation Config', () => {
  it.effect('keeps the loaded configuration when the index does not know its model (no reset)', () =>
    Effect.gen(function* () {
      const { calls, s1 } = yield* activate();

      assert.deepStrictEqual(calls, ['load:s1']);
      assert.strictEqual(s1.status, 'active');
      assert.strictEqual(configValue(s1.configuration, 'model'), 'gpt');
    }).pipe(Effect.scoped),
  );

  it.effect('resets an Unavailable loaded model to the default row current value, never the recommended one', () =>
    Effect.gen(function* () {
      const { calls, s1 } = yield* activate({}, indexWithUnavailableGpt);

      assert.deepStrictEqual(calls, ['load:s1', 'set:model:o1']);
      assert.strictEqual(s1.status, 'active');
      assert.strictEqual(configValue(s1.configuration, 'model'), 'o1');
    }).pipe(Effect.scoped),
  );

  it.effect('a refused reset still activates, on the loaded configuration', () =>
    Effect.gen(function* () {
      const { calls, s1 } = yield* activate({ failSetConfig: true }, indexWithUnavailableGpt);

      assert.deepStrictEqual(calls, ['load:s1', 'set:model:o1']);
      assert.strictEqual(s1.status, 'active');
      assert.strictEqual(configValue(s1.configuration, 'model'), 'gpt');
    }).pipe(Effect.scoped),
  );
});
