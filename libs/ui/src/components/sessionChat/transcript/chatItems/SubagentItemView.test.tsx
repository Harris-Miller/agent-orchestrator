// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, render, screen } from '@testing-library/react';
import { AtomRegistry } from 'effect/reactivity';
import { afterEach } from 'vitest';

import { CLAUDE, CODEX } from '../../../../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../../../../atoms/harnessSnapshot.ts';
import { mockHostLayer } from '../../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../../createHostRuntime.ts';
import { agentLaunchTargetLabel } from '../../../../host/agentLaunchTarget.ts';
import type { NormalizedConfigOption } from '../../../../host/acpSessionBootstrap.ts';
import { harness, session, subagent } from '../../../../host/harnessSnapshot.testing.ts';
import type { SubagentSnapshot } from '../../../../host/subagent.ts';
import { bindHostRuntime } from '../../../../hostRuntime.ts';
import { theme } from '../../../../theme/themes.ts';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { selectedAtom } = await import('../../../../atoms/backendState.atoms.ts');
const { SubagentItemView } = await import('./SubagentItemView.tsx');

afterEach(cleanup);

const configuration: NormalizedConfigOption[] = [
  { choices: [{ id: 'opus', name: 'Opus' }], currentValue: 'opus', id: 'model', name: 'Model', type: 'select' },
  { choices: [{ id: 'high', name: 'High' }], currentValue: 'high', id: 'effort', name: 'Effort', type: 'select' },
];

const mount = (child: SubagentSnapshot, withChildSession = true) => {
  const registry = AtomRegistry.make();
  updateHarnessSnapshot(registry, CODEX, () => harness([session('s1')], [child]));
  updateHarnessSnapshot(registry, CLAUDE, () => harness(withChildSession ? [session('c1', { configuration })] : []));
  registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
  return render(
    <RegistryContext.Provider value={registry}>
      <ThemeProvider theme={theme}>
        <SubagentItemView item={{ id: 'subagent:c1', kind: 'subagent', subagentSessionId: 'c1' }} />
      </ThemeProvider>
    </RegistryContext.Provider>,
  );
};

const iconFor = (container: HTMLElement, label: string) => container.querySelector(`img[aria-label="${label}"]`);

describe('SubagentItemView provider and model', () => {
  it('shows the parent provider icon and no caption for a native child', () => {
    const { container } = mount(subagent('c1', 's1', { name: 'Native' }));
    assert.strictEqual(container.querySelectorAll('img').length, 1);
    assert.isNotNull(iconFor(container, agentLaunchTargetLabel(CODEX)));
    assert.isNull(screen.queryByText(/ · /));
    assert.isNull(screen.queryByText(/Opus/));
  });

  it('shows the child provider icon and "Model · Effort" for a spawned child', () => {
    const { container } = mount({
      ...subagent('c1', 's1', { name: 'Spawned' }),
      kind: 'spawned',
      launchTarget: CLAUDE,
    });
    assert.strictEqual(container.querySelectorAll('img').length, 1);
    assert.isNotNull(iconFor(container, agentLaunchTargetLabel(CLAUDE)));
    assert.isNull(iconFor(container, agentLaunchTargetLabel(CODEX)));
    assert.isNotNull(screen.getByText('Opus · High'));
  });

  it('renders the icon and no caption when the spawned child session is missing', () => {
    const { container } = mount(
      { ...subagent('c1', 's1', { name: 'Spawned' }), kind: 'spawned', launchTarget: CLAUDE },
      false,
    );
    assert.isNotNull(iconFor(container, agentLaunchTargetLabel(CLAUDE)));
    assert.isNull(screen.queryByText(/Opus/));
  });
});
