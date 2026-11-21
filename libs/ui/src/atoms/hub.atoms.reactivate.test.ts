/** `hubAtom` reactivates active sessions when Experimental: App Orchestrated Agents changes, never on the first load. */
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
  const calls: string[] = [];
  const reactivateAtom = runtime.atomRuntime.fn((_arg: undefined) =>
    Effect.sync(() => calls.push(hubAvailability()._tag)),
  );
  const { hubAtom } = createHubAtoms(runtime.atomRuntime, reactivateAtom);
  const setEnabled = (enabled: boolean) => {
    registry.set(userSettingsDocumentAtom, AsyncResult.success({ appOrchestratedAgentsEnabled: enabled }));
  };
  const mount = () => registry.mount(hubAtom);
  return { mount, registry, calls, setEnabled };
});

describe('hubAtom reactivation trigger', () => {
  it.effect('does not reactivate while settings load, nor on a repeated value', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.mount();
      assert.deepStrictEqual(s.calls, []);
      s.setEnabled(false);
      s.setEnabled(false);
      yield* Effect.yieldNow;
      assert.deepStrictEqual(s.calls, []);
    }).pipe(Effect.scoped),
  );

  it.effect('reactivates once per change, after the availability reflects the new setting', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.mount();
      s.setEnabled(false);
      s.setEnabled(true);
      yield* Effect.yieldNow;
      // On: the hub is connecting (or settled) by then, never the stale `unavailable` of the off state.
      assert.strictEqual(s.calls.length, 1);
      assert.notStrictEqual(s.calls[0], 'unavailable');
      s.setEnabled(false);
      yield* Effect.yieldNow;
      assert.deepStrictEqual(s.calls, [s.calls[0], 'unavailable']);
    }).pipe(Effect.scoped),
  );
});
