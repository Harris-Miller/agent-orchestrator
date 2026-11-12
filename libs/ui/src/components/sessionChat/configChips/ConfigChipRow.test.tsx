// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';

import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';
import { theme } from '../../../theme/themes.ts';

import { ConfigChipRow } from './ConfigChipRow.tsx';
import type { SessionAgentChipProps } from './SessionAgentChip.tsx';

afterEach(cleanup);

const select = (id: string, currentValue: string, choices: readonly string[]): NormalizedConfigOption => ({
  choices: choices.map(choice => ({ id: choice, name: choice })),
  currentValue,
  id,
  name: id,
  type: 'select',
});

const configOptions: readonly NormalizedConfigOption[] = [
  { currentValue: false, id: 'fast-mode', name: 'Fast mode', type: 'boolean' },
  select('mode', 'default', ['default', 'plan']),
  select('model', 'sonnet', ['sonnet', 'opus']),
  select('effort', 'high', ['low', 'high']),
];

const mount = (
  overrides: { readonly agent?: Partial<SessionAgentChipProps>; readonly configDisabled?: boolean } = {},
) => {
  const changes: ConfigValueDiff[] = [];
  const agentChanges: AgentLaunchTarget[] = [];
  render(
    <ThemeProvider theme={theme}>
      <ConfigChipRow
        agent={{
          disabled: false,
          interactive: true,
          onChange: target => agentChanges.push(target),
          selectableLaunchTargets: ['codex-acp', 'claude-agent-acp'],
          usableLaunchTargets: ['codex-acp', 'claude-agent-acp'],
          value: 'codex-acp',
          ...overrides.agent,
        }}
        configDisabled={overrides.configDisabled ?? false}
        configOptions={configOptions}
        onConfigChange={diff => changes.push(diff)}
        unavailableModelIds={undefined}
      />
    </ThemeProvider>,
  );
  return { agentChanges, changes };
};

const chip = (index: number) => screen.getAllByRole<HTMLButtonElement>('button')[index]!;

describe('ConfigChipRow', () => {
  it('renders agent, model/effort, access chips then leftover controls in order', () => {
    mount();
    const order = Array.from(document.querySelectorAll('button, input')).map(el => el.tagName);
    assert.deepStrictEqual(order, ['BUTTON', 'BUTTON', 'BUTTON', 'INPUT']);
    assert.include(chip(0).textContent, 'Codex');
    assert.include(chip(1).textContent, 'sonnet');
    assert.include(chip(1).textContent, 'high');
    assert.include(chip(2).textContent, 'default');
  });

  it('reports a leftover control change as a Config change diff', () => {
    const { changes } = mount();
    fireEvent.click(screen.getByLabelText('Fast mode'));
    assert.deepStrictEqual(changes, [{ configId: 'fast-mode', type: 'boolean', value: true }]);
  });

  it('reports the chosen launch target from the agent chip menu', () => {
    const { agentChanges } = mount();
    fireEvent.click(chip(0));
    fireEvent.click(screen.getByRole('menuitem', { name: /Claude/ }));
    assert.deepStrictEqual(agentChanges, ['claude-agent-acp']);
  });

  it('configDisabled disables config controls but not the agent chip', () => {
    mount({ configDisabled: true });
    assert.isFalse(chip(0).disabled);
    assert.isTrue(chip(1).disabled);
    assert.isTrue(chip(2).disabled);
    assert.isTrue(screen.getByLabelText<HTMLInputElement>('Fast mode').disabled);
  });

  it('agent disabled disables the agent chip but not config controls', () => {
    mount({ agent: { disabled: true } });
    assert.isTrue(chip(0).disabled);
    assert.isFalse(chip(1).disabled);
    assert.isFalse(screen.getByLabelText<HTMLInputElement>('Fast mode').disabled);
  });
});
