import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialBackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { initialSubagentSnapshot } from '../host/subagent.ts';
import { configOptionIndexFromProbeResponses } from '../host/configOptionIndexFixtures.ts';
import { configOptionIndexAtom, harnessAvailabilityAtom } from './backendState.atoms.ts';
import { enableProviders } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { createProvidersAtoms } from './providers.atoms.ts';

const cachedIndex = configOptionIndexFromProbeResponses('sonnet', {
  sonnet: {
    configOptions: [
      {
        currentValue: 'sonnet',
        id: 'model',
        name: 'Model',
        options: [{ name: 'Sonnet', value: 'sonnet' }],
        type: 'select',
      },
    ],
  },
});

const setup = () => {
  const runtime = createHostRuntime(mockHostLayer);
  // Availability reads neither the harness runtime (beyond the mock host) nor user settings, so stubs are safe.
  const { launchTargetAvailabilityAtom } = createProvidersAtoms(runtime, {} as never, {
    userSettingsAtom: Atom.make(undefined) as never,
  });
  const registry = AtomRegistry.make();
  enableProviders(registry, ['claude-agent-acp']);
  updateHarnessSnapshot(registry, 'claude-agent-acp', () => ({ ...initialBackendHarnessSnapshot(), phase: 'usable' }));
  registry.set(configOptionIndexAtom('claude-agent-acp'), cachedIndex);
  return { launchTargetAvailabilityAtom, registry };
};

const countChanges = (registry: AtomRegistry.AtomRegistry, atom: Atom.Atom<unknown>) => {
  const counter = { count: 0 };
  registry.subscribe(atom, () => {
    counter.count += 1;
  });
  return counter;
};

describe('launch target availability atoms', () => {
  it.effect('keep their reference when a child transcript changes; change on phase or failure', () =>
    Effect.gen(function* () {
      const { launchTargetAvailabilityAtom, registry } = setup();
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          registry.dispose();
        }),
      );
      const harness = countChanges(registry, harnessAvailabilityAtom);
      const availability = countChanges(registry, launchTargetAvailabilityAtom);
      const before = registry.get(launchTargetAvailabilityAtom);

      updateHarnessSnapshot(registry, 'claude-agent-acp', current => ({
        ...current,
        subagents: { a: { ...initialSubagentSnapshot('a', 's1'), name: 'A' } },
      }));
      updateHarnessSnapshot(registry, 'claude-agent-acp', current => ({
        ...current,
        subagents: { a: { ...initialSubagentSnapshot('a', 's1'), name: 'B' } },
      }));
      assert.strictEqual(harness.count, 0);
      assert.strictEqual(availability.count, 0);
      assert.strictEqual(registry.get(launchTargetAvailabilityAtom), before);

      updateHarnessSnapshot(registry, 'claude-agent-acp', current => ({ ...current, phase: 'initialized' }));
      assert.strictEqual(harness.count, 1);
      assert.strictEqual(availability.count, 1);
      const before2 = registry.get(launchTargetAvailabilityAtom);
      assert.strictEqual(registry.get(harnessAvailabilityAtom).reasons['claude-agent-acp'], 'Starting…');

      updateHarnessSnapshot(registry, 'claude-agent-acp', current => ({
        ...current,
        failure: { _tag: 'Failed', message: 'boom' },
        phase: 'error',
      }));
      assert.strictEqual(harness.count, 2);
      assert.strictEqual(registry.get(harnessAvailabilityAtom).reasons['claude-agent-acp'], 'boom');
      // The Provider's own reason (no `claude` CLI on PATH in tests) outranks the harness reason, so the merged atom does not change.
      assert.strictEqual(availability.count, 1);
      assert.strictEqual(
        registry.get(launchTargetAvailabilityAtom).reasons['claude-agent-acp'],
        'claude not found on PATH',
      );
      assert.strictEqual(registry.get(launchTargetAvailabilityAtom), before2);
    }).pipe(Effect.scoped),
  );
});
