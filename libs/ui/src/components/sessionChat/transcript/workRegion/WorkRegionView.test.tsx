// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AtomRegistry } from 'effect/reactivity';
import { afterEach } from 'vitest';

import { CODEX } from '../../../../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../../../../atoms/harnessSnapshot.ts';
import { mockHostLayer } from '../../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../../createHostRuntime.ts';
import { harness, session, subagent } from '../../../../host/harnessSnapshot.testing.ts';
import type { ChatItem } from '../../../../host/sessionUpdateReducer.ts';
import { bindHostRuntime } from '../../../../hostRuntime.ts';
import { theme } from '../../../../theme/themes.ts';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { selectedAtom } = await import('../../../../atoms/backendState.atoms.ts');
const { SessionChatSurfaceProvider } = await import('../../useSessionChatSurface.tsx');
const { WorkRegionView } = await import('./WorkRegionView.tsx');

afterEach(cleanup);

const items: ChatItem[] = [
  { id: 'subagent:c1', kind: 'subagent', subagentSessionId: 'c1' },
  { id: 'subagent:c2', kind: 'subagent', subagentSessionId: 'c2' },
  { id: 't1', kind: 'agent_thought', text: 'Pondering the plan' },
  { id: 'subagent:c3', kind: 'subagent', subagentSessionId: 'c3' },
];

const mount = (inFlight: boolean) => {
  const registry = AtomRegistry.make();
  updateHarnessSnapshot(registry, CODEX, () =>
    harness(
      [session('s1')],
      [
        subagent('c1', 's1', { name: 'Runner', state: { state: 'running' } }),
        subagent('c2', 's1', { name: 'Finisher', state: { state: 'completed' } }),
        subagent('c3', 's1', { name: 'Last', state: { state: 'completed' } }),
      ],
    ),
  );
  registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
  return render(
    <RegistryContext.Provider value={registry}>
      <ThemeProvider theme={theme}>
        <SessionChatSurfaceProvider onClientError={() => undefined}>
          <WorkRegionView
            inFlight={inFlight}
            region={{
              id: 'w1',
              isLastInTurn: true,
              isLastTurn: true,
              items,
              kind: 'work_region',
              userMessage: { id: 'u1', kind: 'user_message', text: 'go' },
            }}
          />
        </SessionChatSurfaceProvider>
      </ThemeProvider>
    </RegistryContext.Provider>,
  );
};

describe('WorkRegionView pinned subagents', () => {
  it('pins running and completed subagents above the preview, which shows the latest non-subagent item', () => {
    mount(true);
    const names = ['Runner', 'Finisher', 'Last'].map(name => screen.getByText(name));
    const preview = screen.getByText('Pondering the plan');
    for (const node of names) {
      assert.strictEqual(node.compareDocumentPosition(preview), Node.DOCUMENT_POSITION_FOLLOWING);
    }
    assert.strictEqual(screen.getAllByText('Runner').length, 1);
  });

  it('keeps them pinned when no turn is in flight', () => {
    mount(false);
    assert.isNotNull(screen.getByText('Runner'));
    assert.isNull(screen.queryByText('Pondering the plan'));
  });

  it('renders each subagent once when expanded', () => {
    mount(true);
    fireEvent.click(screen.getByRole('button', { name: /^Work(ing|ed)/ }));
    assert.strictEqual(screen.getAllByText('Runner').length, 1);
    assert.strictEqual(screen.getAllByText('Finisher').length, 1);
  });
});
