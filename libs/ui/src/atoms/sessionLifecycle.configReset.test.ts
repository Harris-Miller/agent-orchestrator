/** Activation resets a loaded Session's Config the Config option index no longer offers (desktop ADR-0016). */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { configValue } from '../host/sessionConfiguration.ts';

import { backendHarnessSnapshotAtom, configOptionIndexAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { advertise, CODEX, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

/** An index that no longer offers `gpt` (the fake `session/load` reports `gpt`); its default model is `o1`. */
const indexWithoutGpt: ConfigOptionIndex = {
  byModel: {
    o1: [{ choices: [{ id: 'o1', name: 'o1' }], currentValue: 'o1', id: 'model', name: 'Model', type: 'select' }],
  },
  defaultModelId: 'o1',
  unavailableModelIds: [],
};

/** An inactive Session `s1` in `/proj` (no transcript, so activation loads it), Bootstrap `ready`. */
const activate = Effect.fnUntraced(function* (fake: FakeAgentOpts = {}) {
  const calls: string[] = [];
  const registry = yield* freshRegistry;
  yield* installFakeAgent(calls, fake);
  const runtime = createHostRuntime(mockHostLayer);
  const { cancelPromptAtomFn } = createChatAtoms(runtime);
  const { refreshSessionFsListingAtomFn } = createSessionFsListingAtoms(runtime, Atom.make<readonly string[]>([]));
  const atoms = createSessionLifecycleAtoms(runtime, refreshSessionFsListingAtomFn, cancelPromptAtomFn);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [{ cwd: '/proj', sessionId: 's1' }],
    sessions: { s1: { ...initialSessionSnapshot('s1', 'inactive'), cwd: '/proj' } },
  }));
  advertise(registry, CODEX, {});
  registry.set(configOptionIndexAtom(CODEX), indexWithoutGpt);

  yield* runAtomFn(registry, atoms.activateSessionAtomFn, { launchTarget: CODEX, sessionId: 's1' });

  return { calls, s1: registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.s1 };
});

describe('activation Config reset', () => {
  it.effect('folds the reset into the Session configuration and ends active', () =>
    Effect.gen(function* () {
      const { calls, s1 } = yield* activate();

      assert.deepStrictEqual(calls, ['load:s1', 'set:model:o1']);
      assert.strictEqual(s1.status, 'active');
      assert.strictEqual(configValue(s1.configuration, 'model'), 'o1');
    }).pipe(Effect.scoped),
  );

  it.effect('a refused reset still activates, on the loaded configuration', () =>
    Effect.gen(function* () {
      const { calls, s1 } = yield* activate({ failSetConfig: true });

      assert.deepStrictEqual(calls, ['load:s1', 'set:model:o1']);
      assert.strictEqual(s1.status, 'active');
      assert.strictEqual(configValue(s1.configuration, 'model'), 'gpt');
    }).pipe(Effect.scoped),
  );
});
