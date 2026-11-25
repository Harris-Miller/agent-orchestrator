// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AtomRegistry } from 'effect/reactivity';
import { afterEach } from 'vitest';

import { CODEX } from '../../../atoms/fakeAgent.testing.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ConfigOptionIndex, ConfigOptionValues } from '../../../host/configProbe.ts';
import { theme } from '../../../theme/themes.ts';

import { HandoffModal } from './HandoffModal.tsx';

afterEach(cleanup);

const choices = (ids: readonly string[]) => ids.map(id => ({ id, name: id }));

/** A Config option index whose model and effort both carry a Recommended value that differs from the current one. */
const indexWithRecommendations: ConfigOptionIndex = {
  byModel: {
    opus: [
      {
        choices: choices(['opus', 'sonnet']),
        currentValue: 'opus',
        id: 'model',
        name: 'Model',
        recommendedValue: 'opus',
        type: 'select',
      },
      {
        choices: choices(['low', 'high']),
        currentValue: 'low',
        id: 'effort',
        name: 'Effort',
        recommendedValue: 'high',
        type: 'select',
      },
    ],
  },
  defaultModelId: 'opus',
  unavailableModelIds: [],
};

describe('HandoffModal confirm', () => {
  it('fills Recommended values at submit when the seed predates the Config option index', () => {
    const confirmed: { configValues: ConfigOptionValues; targetLaunchTarget: AgentLaunchTarget }[] = [];
    const registry = AtomRegistry.make();
    let index: ConfigOptionIndex | undefined;
    const ui = () => (
      <RegistryContext.Provider value={registry}>
        <ThemeProvider theme={theme}>
          <HandoffModal
            getConfigOptionIndex={() => index}
            onCancel={() => undefined}
            onConfirm={arg => confirmed.push(arg)}
            open
            selectableLaunchTargets={[CODEX]}
            sourceLaunchTarget={CODEX}
            usableLaunchTargets={[CODEX]}
          />
        </ThemeProvider>
      </RegistryContext.Provider>
    );

    // Seeded with no index: `hardResetForAgent` yields `{}`.
    const view = render(ui());
    // The index arrives afterwards; the modal's seed is never redone.
    index = indexWithRecommendations;
    view.rerender(ui());
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    assert.deepStrictEqual(confirmed, [{ configValues: { effort: 'high', model: 'opus' }, targetLaunchTarget: CODEX }]);
  });
});
