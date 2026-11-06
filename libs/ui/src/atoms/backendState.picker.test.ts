import { assert, describe, it } from '@effect/vitest';
import { AtomRegistry } from 'effect/reactivity';

import { initialBackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AcpBootstrapPhase } from '../host/acpSessionBootstrap.ts';
import { configOptionIndexFromProbeResponses } from '../host/configProbe.ts';
import {
  backendHarnessStateAtom,
  configOptionIndexAtom,
  launchTargetUnavailableReasonsAtom,
  providerEnabledMapAtom,
  readyLaunchTargetsAtom,
} from './backendState.atoms.ts';

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

const setup = (phase: AcpBootstrapPhase, withCache: boolean) => {
  const registry = AtomRegistry.make();
  registry.set(providerEnabledMapAtom, { 'claude-agent-acp': true });
  registry.set(backendHarnessStateAtom('claude-agent-acp'), { ...initialBackendHarnessSnapshot(), phase });
  if (withCache) registry.set(configOptionIndexAtom('claude-agent-acp'), cachedIndex);
  return registry;
};

describe('launch target picker gating', () => {
  it('usable + cached index → selectable without waiting for ready', () => {
    const registry = setup('usable', true);
    assert.deepStrictEqual(registry.get(readyLaunchTargetsAtom), ['claude-agent-acp']);
    assert.isUndefined(registry.get(launchTargetUnavailableReasonsAtom)['claude-agent-acp']);
  });

  it('usable + no cache → disabled with Loading models…', () => {
    const registry = setup('usable', false);
    assert.deepStrictEqual(registry.get(readyLaunchTargetsAtom), []);
    assert.strictEqual(registry.get(launchTargetUnavailableReasonsAtom)['claude-agent-acp'], 'Loading models…');
  });

  it('initialized → Starting…', () => {
    const registry = setup('initialized', true);
    assert.deepStrictEqual(registry.get(readyLaunchTargetsAtom), []);
    assert.strictEqual(registry.get(launchTargetUnavailableReasonsAtom)['claude-agent-acp'], 'Starting…');
  });

  it('ready + no index → No configuration available', () => {
    const registry = setup('ready', false);
    assert.strictEqual(
      registry.get(launchTargetUnavailableReasonsAtom)['claude-agent-acp'],
      'No configuration available',
    );
  });
});
