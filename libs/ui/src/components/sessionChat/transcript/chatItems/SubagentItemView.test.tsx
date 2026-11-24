// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AtomRegistry } from 'effect/reactivity';
import { afterEach, vi } from 'vitest';

import { CLAUDE, CODEX } from '../../../../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../../../../atoms/harnessSnapshot.ts';
import { mockHostLayer } from '../../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../../createHostRuntime.ts';
import { agentLaunchTargetLabel } from '../../../../host/agentLaunchTarget.ts';
import type { NormalizedConfigOption } from '../../../../host/acpSessionBootstrap.ts';
import { harness, session, subagent } from '../../../../host/harnessSnapshot.testing.ts';
import type { SubagentSnapshot } from '../../../../host/subagent.ts';
import { emptySessionTranscript, reduceSessionUpdate } from '../../../../host/sessionUpdateReducer.ts';
import { bindHostRuntime } from '../../../../hostRuntime.ts';
import { theme } from '../../../../theme/themes.ts';

const { cancelMock } = vi.hoisted(() => ({ cancelMock: vi.fn() }));

// `cancelSubagentAtomFn` needs a live backend, so the hook is stubbed here.
vi.mock('../../useCancelSubagent.ts', () => ({
  useCancelSubagent: () => ({ cancel: cancelMock, cancelRequested: false }),
}));

bindHostRuntime(createHostRuntime(mockHostLayer));
const { configOptionIndexAtom, selectedAtom, viewedSubagentAtom } =
  await import('../../../../atoms/backendState.atoms.ts');
const { SubagentItemView } = await import('./SubagentItemView.tsx');
const { SessionChatSurfaceProvider } = await import('../../useSessionChatSurface.tsx');

afterEach(() => {
  cleanup();
  cancelMock.mockClear();
});

const configuration: NormalizedConfigOption[] = [
  { choices: [{ id: 'opus', name: 'Opus' }], currentValue: 'opus', id: 'model', name: 'Model', type: 'select' },
  { choices: [{ id: 'high', name: 'High' }], currentValue: 'high', id: 'effort', name: 'Effort', type: 'select' },
];

const mount = (child: SubagentSnapshot, withChildSession = true) => {
  const registry = AtomRegistry.make();
  updateHarnessSnapshot(registry, CODEX, () => harness([session('s1')], [child]));
  updateHarnessSnapshot(registry, CLAUDE, () => harness(withChildSession ? [session('c1', { configuration })] : []));
  registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
  return {
    ...render(
      <RegistryContext.Provider value={registry}>
        <ThemeProvider theme={theme}>
          <SessionChatSurfaceProvider onClientError={() => undefined}>
            <SubagentItemView item={{ id: 'subagent:c1', kind: 'subagent', subagentSessionId: 'c1' }} />
          </SessionChatSurfaceProvider>
        </ThemeProvider>
      </RegistryContext.Provider>,
    ),
    registry,
  };
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

describe('SubagentItemView restored child', () => {
  const index = {
    byModel: { haiku: [...configuration.map(option => ({ ...option, currentValue: undefined }))] },
    defaultModelId: 'haiku',
    unavailableModelIds: [],
  };
  const restored: SubagentSnapshot = {
    ...subagent('c1', 's1', {
      name: 'Restored',
      state: { state: 'completed' },
      transcript: reduceSessionUpdate(emptySessionTranscript(), {
        content: { text: 'Hello, World!', type: 'text' },
        sessionUpdate: 'agent_message_chunk',
      }),
    }),
    kind: 'spawned',
    launchTarget: CLAUDE,
    restored: { config: { effort: 'high', model: 'haiku' } },
  };

  it('shows name, provider, Model/Effort from the index and the final message, with no child session', () => {
    const registry = AtomRegistry.make();
    updateHarnessSnapshot(registry, CODEX, () => harness([session('s1')], [restored]));
    registry.set(configOptionIndexAtom(CLAUDE), index);
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
    const { container } = render(
      <RegistryContext.Provider value={registry}>
        <ThemeProvider theme={theme}>
          <SessionChatSurfaceProvider onClientError={() => undefined}>
            <SubagentItemView item={{ id: 'subagent:c1', kind: 'subagent', subagentSessionId: 'c1' }} />
          </SessionChatSurfaceProvider>
        </ThemeProvider>
      </RegistryContext.Provider>,
    );
    assert.isNotNull(screen.getByText('Restored'));
    assert.isNotNull(iconFor(container, agentLaunchTargetLabel(CLAUDE)));
    assert.isNotNull(screen.getByText('Hello, World!'));
  });
});

describe('SubagentItemView roll-up over descendants (#277)', () => {
  const running = { state: { state: 'running' } } as const;
  const mountTree = (descendants: SubagentSnapshot[]) => {
    const registry = AtomRegistry.make();
    updateHarnessSnapshot(registry, CODEX, () =>
      harness(
        [session('s1')],
        [subagent('c1', 's1', { name: 'Parent child', state: { state: 'completed' } }), ...descendants],
      ),
    );
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
    render(
      <RegistryContext.Provider value={registry}>
        <ThemeProvider theme={theme}>
          <SessionChatSurfaceProvider onClientError={() => undefined}>
            <SubagentItemView item={{ id: 'subagent:c1', kind: 'subagent', subagentSessionId: 'c1' }} />
          </SessionChatSurfaceProvider>
        </ThemeProvider>
      </RegistryContext.Provider>,
    );
  };

  it('counts running descendants of the child', () => {
    mountTree([subagent('g1', 'c1', running), subagent('g2', 'g1', running)]);
    assert.isNotNull(screen.getByText('2 subagents running'));
  });

  it('shows needs input when a descendant has a Pending interaction, over a finished own state', () => {
    mountTree([subagent('g1', 'c1', { ...running, pendingPermission: { request: {} } as never })]);
    assert.isNotNull(screen.getByText('Needs input'));
    assert.isNotNull(screen.getByText('1 subagent running'));
  });

  it('shows neither with no working descendants', () => {
    mountTree([subagent('g1', 'c1', { state: { state: 'completed' } })]);
    assert.isNull(screen.queryByText(/running/));
    assert.isNull(screen.queryByText('Needs input'));
  });
});

describe('SubagentItemView cancel', () => {
  const running = { state: { state: 'running' } } as const;
  const cancellable = { capabilities: { cancel: {} } } as const;

  it('offers Cancel when running and the child grants cancel', () => {
    mount(subagent('c1', 's1', { ...running, ...cancellable }));
    assert.strictEqual(screen.getAllByRole('button', { name: 'Cancel' }).length, 1);
  });

  it('offers no Cancel when running without a grant', () => {
    mount(subagent('c1', 's1', running));
    assert.isNull(screen.queryByRole('button', { name: 'Cancel' }));
  });

  it('offers no Cancel once finished', () => {
    mount(subagent('c1', 's1', { ...cancellable, state: { state: 'completed' } }));
    assert.isNull(screen.queryByRole('button', { name: 'Cancel' }));
  });

  describe('interaction', () => {
    const working = subagent('c1', 's1', { name: 'Working', ...running, ...cancellable });

    it('opens the Subagent view when the row is clicked', () => {
      const { registry } = mount(working);
      fireEvent.click(screen.getByText('Working'));
      assert.strictEqual(registry.get(viewedSubagentAtom)?.childId, 'c1');
    });

    it('opens the Subagent view on Enter and Space on the row', () => {
      const { registry } = mount(working);
      const [row] = screen.getAllByRole('button');
      assert.strictEqual(row.getAttribute('tabindex'), '0');
      fireEvent.keyDown(row, { key: 'Enter' });
      assert.strictEqual(registry.get(viewedSubagentAtom)?.childId, 'c1');
      registry.set(viewedSubagentAtom, undefined);
      fireEvent.keyDown(row, { key: ' ' });
      assert.strictEqual(registry.get(viewedSubagentAtom)?.childId, 'c1');
    });

    it('Enter on Cancel does not open the Subagent view', () => {
      const { registry } = mount(working);
      fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Enter' });
      assert.isUndefined(registry.get(viewedSubagentAtom));
    });

    it('clicking Cancel cancels without opening the Subagent view', () => {
      const { registry } = mount(working);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      assert.strictEqual(cancelMock.mock.calls.length, 1);
      assert.isUndefined(registry.get(viewedSubagentAtom));
    });
  });
});
