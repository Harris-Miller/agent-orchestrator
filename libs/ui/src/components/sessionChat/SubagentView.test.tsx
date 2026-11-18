// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, render, screen } from '@testing-library/react';
import { AtomRegistry } from 'effect/reactivity';
import { afterEach } from 'vitest';

import { CLAUDE, CODEX } from '../../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../../atoms/harnessSnapshot.ts';
import { createHostRuntime } from '../../createHostRuntime.ts';
import { harness, session, subagent } from '../../host/harnessSnapshot.testing.ts';
import { agentLaunchTargetLabel } from '../../host/agentLaunchTarget.ts';
import type { NativeSubagentSnapshot, SubagentSnapshot } from '../../host/subagent.ts';
import { bindHostRuntime } from '../../hostRuntime.ts';
import { mockHostLayer } from '../../atoms/mockHostLayer.testing.ts';
import { theme } from '../../theme/themes.ts';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { viewedSubagentAtom } = await import('../../atoms/backendState.atoms.ts');
const { SubagentView } = await import('./SubagentView.tsx');

afterEach(cleanup);

const mount = (patch: Partial<NativeSubagentSnapshot>, extraItems: SubagentSnapshot['transcript']['items'] = []) => {
  const registry = AtomRegistry.make();
  const child = subagent('c1', 's1', {
    name: 'Reply alpha',
    transcript: {
      items: [...extraItems, { id: 'm1', kind: 'agent_message', text: 'alpha' }],
      messageIndices: new Map(),
      toolCallIndices: new Map(),
    },
    ...patch,
  });
  updateHarnessSnapshot(registry, CODEX, () => harness([session('s1')], [child]));
  registry.set(viewedSubagentAtom, { childId: 'c1', launchTarget: CODEX, rootSessionId: 's1' });
  return render(
    <RegistryContext.Provider value={registry}>
      <ThemeProvider theme={theme}>
        <SubagentView onClientError={() => undefined} />
      </ThemeProvider>
    </RegistryContext.Provider>,
  );
};

describe('SubagentView task', () => {
  it('renders the task as markdown before the transcript items', () => {
    const { container } = mount({ task: 'Reply with **alpha** only' });
    const task = screen.getByTestId('subagent-task');
    assert.strictEqual(task.querySelector('strong')?.textContent, 'alpha');
    const reply = screen.getByText('alpha', { selector: 'p' });
    assert.isTrue(container.contains(task));
    assert.strictEqual(task.compareDocumentPosition(reply), Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders no task row when the task is absent', () => {
    mount({});
    assert.isNull(screen.queryByTestId('subagent-task'));
  });

  it('renders no task row when the task is blank', () => {
    mount({ task: '  \n ' });
    assert.isNull(screen.queryByTestId('subagent-task'));
  });

  it('shows the task once when a load replays it as the first user message', () => {
    mount({ task: 'Do the thing' }, [{ id: 'u1', kind: 'user_message', text: 'Do the thing' }]);
    assert.lengthOf(screen.getAllByText('Do the thing'), 1);
  });

  it('keeps a user message that differs from the task', () => {
    mount({ task: 'Do the thing' }, [{ id: 'u1', kind: 'user_message', text: 'Do something else' }]);
    assert.lengthOf(screen.getAllByText('Do something else'), 1);
  });
});

describe('SubagentView dock', () => {
  it('shows the read-only note and Provider for a native child, with no model chip', () => {
    mount({});
    assert.isNotNull(screen.getByText('Subagent session — read-only.'));
    assert.isNotNull(screen.getByText(agentLaunchTargetLabel(CODEX)));
    assert.isNull(screen.queryByText('Opus'));
  });

  it('shows a spawned child Provider and disabled model chip', () => {
    const registry = AtomRegistry.make();
    const child: SubagentSnapshot = {
      ...subagent('c1', 's1', { name: 'Spawned' }),
      kind: 'spawned',
      launchTarget: CLAUDE,
    };
    updateHarnessSnapshot(registry, CODEX, () => harness([session('s1')], [child]));
    updateHarnessSnapshot(registry, CLAUDE, () =>
      harness([
        session('c1', {
          configuration: [
            {
              choices: [{ id: 'opus', name: 'Opus' }],
              currentValue: 'opus',
              id: 'model',
              name: 'Model',
              type: 'select',
            },
          ],
        }),
      ]),
    );
    registry.set(viewedSubagentAtom, { childId: 'c1', launchTarget: CODEX, rootSessionId: 's1' });
    render(
      <RegistryContext.Provider value={registry}>
        <ThemeProvider theme={theme}>
          <SubagentView onClientError={() => undefined} />
        </ThemeProvider>
      </RegistryContext.Provider>,
    );
    assert.isNotNull(screen.getByText(agentLaunchTargetLabel(CLAUDE)));
    const chip = screen.getByText('Opus').closest('[role="button"], button, .MuiChip-root');
    assert.isNotNull(chip);
    assert.isTrue(
      chip?.classList.contains('Mui-disabled') === true ||
        chip?.getAttribute('aria-disabled') === 'true' ||
        (chip as HTMLButtonElement).disabled,
    );
  });

  it('renders no editor, attach or send controls', () => {
    mount({});
    assert.isNull(screen.queryByRole('textbox'));
    assert.isNull(screen.queryByLabelText('Attach images'));
    assert.isNull(screen.queryByLabelText('Send'));
  });
});
