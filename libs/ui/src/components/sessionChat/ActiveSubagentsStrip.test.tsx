// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, render, screen } from '@testing-library/react';
import { AtomRegistry } from 'effect/reactivity';
import { afterEach } from 'vitest';

import { CODEX } from '../../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../../atoms/harnessSnapshot.ts';
import { mockHostLayer } from '../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../createHostRuntime.ts';
import { harness, session, subagent } from '../../host/harnessSnapshot.testing.ts';
import type { SubagentSnapshot } from '../../host/subagent.ts';
import { bindHostRuntime } from '../../hostRuntime.ts';
import { theme } from '../../theme/themes.ts';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { selectedActiveSubagentIdsAtom, selectedAtom } = await import('../../atoms/backendState.atoms.ts');
const { ActiveSubagentsStrip } = await import('./ActiveSubagentsStrip.tsx');

afterEach(cleanup);

const running = { state: { state: 'running' } } as const;
const cancellable = { capabilities: { cancel: {} } } as const;

const setup = (children: SubagentSnapshot[], sessionPatch = {}) => {
  const registry = AtomRegistry.make();
  updateHarnessSnapshot(registry, CODEX, () => harness([session('s1', sessionPatch)], children));
  registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
  return registry;
};

const mount = (registry: AtomRegistry.AtomRegistry) =>
  render(
    <RegistryContext.Provider value={registry}>
      <ThemeProvider theme={theme}>
        <ActiveSubagentsStrip onClientError={() => undefined} />
      </ThemeProvider>
    </RegistryContext.Provider>,
  );

describe('selectedActiveSubagentIdsAtom', () => {
  it('lists working or needs-input descendants at any depth, not finished or foreign ones', () => {
    const registry = setup([
      subagent('c1', 's1', running),
      subagent('g1', 'c1', { state: { state: 'requires_action' } }),
      subagent('c2', 's1', { state: { state: 'completed' } }),
      subagent('c3', 's1', { pendingPermission: { request: {} } as never, state: { state: 'idle' } }),
      subagent('x1', 'other', running),
    ]);
    assert.deepStrictEqual(registry.get(selectedActiveSubagentIdsAtom), ['c1', 'g1', 'c3']);
  });

  it('keeps the same reference when membership is unchanged', () => {
    const registry = setup([subagent('c1', 's1', running)]);
    registry.mount(selectedActiveSubagentIdsAtom);
    const before = registry.get(selectedActiveSubagentIdsAtom);
    updateHarnessSnapshot(registry, CODEX, current => ({
      ...current,
      subagents: { c1: { ...subagent('c1', 's1', running), name: 'renamed' } },
    }));
    assert.strictEqual(registry.get(selectedActiveSubagentIdsAtom), before);
  });
});

describe('ActiveSubagentsStrip', () => {
  it('shows a running child with no turn in flight and no Work region', () => {
    mount(setup([subagent('c1', 's1', { ...running, name: 'Runner' })]));
    assert.isNotNull(screen.getByText('Runner'));
  });

  it('flags a child that needs input', () => {
    mount(setup([subagent('c1', 's1', { state: { state: 'requires_action' } })]));
    assert.isNotNull(screen.getByText('Needs input'));
  });

  it('omits finished children', () => {
    mount(setup([subagent('c1', 's1', { name: 'Done', state: { state: 'completed' } })]));
    assert.isNull(screen.queryByText('Done'));
  });

  it('offers Cancel only when the child grants it', () => {
    mount(setup([subagent('c1', 's1', { ...running, ...cancellable }), subagent('c2', 's1', running)]));
    assert.strictEqual(screen.getAllByRole('button', { name: 'Cancel' }).length, 1);
  });
});
