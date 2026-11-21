/** `hubAtom` reloads active sessions when Experimental: App Orchestrated Agents changes, never on the first load. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { AsyncResult } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { hubAvailability } from '../host/hubConnection.ts';

import { freshRegistry } from './fakeAgent.testing.ts';
import { createHubAtoms } from './hub.atoms.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { userSettingsDocumentAtom } from './userSettings/userSettingsDocument.atoms.ts';

const setup = Effect.fnUntraced(function* () {
  const runtime = createHostRuntime(mockHostLayer);
  const registry = yield* freshRegistry;
  const reloads: string[] = [];
  const reloadAtom = runtime.atomRuntime.fn((_arg: undefined) =>
    Effect.sync(() => reloads.push(hubAvailability()._tag)),
  );
  const { hubAtom } = createHubAtoms(runtime.atomRuntime, reloadAtom);
  const setEnabled = (enabled: boolean) => {
    registry.set(userSettingsDocumentAtom, AsyncResult.success({ appOrchestratedAgentsEnabled: enabled }));
  };
  const mount = () => registry.mount(hubAtom);
  return { mount, registry, reloads, setEnabled };
});

describe('hubAtom reload trigger', () => {
  it.effect('does not reload while settings load, nor on a repeated value', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.mount();
      assert.deepStrictEqual(s.reloads, []);
      s.setEnabled(false);
      s.setEnabled(false);
      yield* Effect.yieldNow;
      assert.deepStrictEqual(s.reloads, []);
    }).pipe(Effect.scoped),
  );

  it.effect('reloads once per change, after the availability reflects the new setting', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.mount();
      s.setEnabled(false);
      s.setEnabled(true);
      yield* Effect.yieldNow;
      // On: the hub is connecting (or settled) by then, never the stale `unavailable` of the off state.
      assert.deepStrictEqual(s.reloads.length, 1);
      assert.notStrictEqual(s.reloads[0], 'unavailable');
      s.setEnabled(false);
      yield* Effect.yieldNow;
      assert.deepStrictEqual(s.reloads, [s.reloads[0], 'unavailable']);
    }).pipe(Effect.scoped),
  );
});
