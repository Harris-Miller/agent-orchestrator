// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';
import { afterEach } from 'vitest';

import { userSettingsDocumentAtom } from '../../../atoms/userSettings/userSettingsDocument.atoms.ts';
import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';
import { theme } from '../../../theme/themes.ts';

import { ConfigChipRow } from './ConfigChipRow.tsx';
import type { SessionAgentChipProps } from './SessionAgentChip.tsx';
import type { ModelSearchScope } from './SessionModelEffortChip.tsx';

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
  overrides: {
    readonly agent?: Partial<SessionAgentChipProps>;
    readonly configDisabled?: boolean;
    readonly configOptions?: readonly NormalizedConfigOption[];
    readonly modelSearch?: ModelSearchScope;
    readonly settings?: Record<string, unknown>;
  } = {},
) => {
  const registry = AtomRegistry.make();
  registry.set(userSettingsDocumentAtom, AsyncResult.success(overrides.settings ?? {}));
  const changes: ConfigValueDiff[] = [];
  const agentChanges: AgentLaunchTarget[] = [];
  render(
    <RegistryContext.Provider value={registry}>
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
          configOptions={overrides.configOptions ?? configOptions}
          modelSearch={overrides.modelSearch}
          onConfigChange={diff => changes.push(diff)}
          unavailableModelIds={undefined}
        />
      </ThemeProvider>
    </RegistryContext.Provider>,
  );
  return { agentChanges, changes };
};

const chip = (index: number) => screen.getAllByRole<HTMLButtonElement>('button')[index];

describe('ConfigChipRow', () => {
  it('renders agent, model/effort and access chips in order, with other options inside the picker', () => {
    mount();
    const order = Array.from(document.querySelectorAll('button, input')).map(el => el.tagName);
    assert.deepStrictEqual(order, ['BUTTON', 'BUTTON', 'BUTTON']);
    assert.include(chip(0).textContent, 'Codex');
    assert.include(chip(1).textContent, 'sonnet');
    assert.include(chip(1).textContent, 'high');
    assert.include(chip(2).textContent, 'default');
  });

  it('reports an Options row change as a Config change diff', () => {
    const { changes } = mount();
    fireEvent.click(chip(1));
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
  });

  it('agent disabled disables the agent chip but not config controls', () => {
    mount({ agent: { disabled: true } });
    assert.isTrue(chip(0).disabled);
    assert.isFalse(chip(1).disabled);
  });

  describe('model picker prefs', () => {
    const models = ['m1', 'm2', 'm3'];
    const modelOptions = (current: string): readonly NormalizedConfigOption[] => [select('model', current, models)];
    const menuModels = () => screen.getAllByRole('menuitem').map(item => item.textContent);

    it('hides Hidden models and applies Model order for the launch target', () => {
      mount({
        configOptions: modelOptions('m1'),
        settings: { hiddenModels: { 'codex-acp': ['m2'] }, modelOrder: { 'codex-acp': ['m3'] } },
      });
      fireEvent.click(chip(1));
      assert.deepStrictEqual(menuModels(), ['m3', 'm1']);
    });

    it('keeps a hidden current model in the menu, selected', () => {
      mount({
        configOptions: modelOptions('m2'),
        settings: { hiddenModels: { 'codex-acp': ['m1', 'm2'] } },
      });
      assert.include(chip(1).textContent, 'm2');
      fireEvent.click(chip(1));
      assert.deepStrictEqual(menuModels(), ['m2', 'm3']);
    });

    it('lists every model when all are hidden', () => {
      mount({
        configOptions: modelOptions('m2'),
        settings: { hiddenModels: { 'codex-acp': ['m1', 'm2', 'm3'] } },
      });
      fireEvent.click(chip(1));
      assert.deepStrictEqual(menuModels(), models);
    });

    it('ignores prefs of other launch targets', () => {
      mount({ configOptions: modelOptions('m1'), settings: { hiddenModels: { 'claude-agent-acp': ['m2'] } } });
      fireEvent.click(chip(1));
      assert.deepStrictEqual(menuModels(), models);
    });
  });

  describe('model picker popover', () => {
    const models = ['m1', 'm2', 'm3'];
    const modelOptions = (current: string): readonly NormalizedConfigOption[] => [select('model', current, models)];
    const menuModels = () => screen.getAllByRole('menuitem').map(item => item.textContent);

    it('reveals Hidden models under Show more and re-hides them', () => {
      mount({ configOptions: modelOptions('m1'), settings: { hiddenModels: { 'codex-acp': ['m2'] } } });
      fireEvent.click(chip(1));
      assert.deepStrictEqual(menuModels(), ['m1', 'm3']);
      fireEvent.click(screen.getByRole('button', { name: 'Show more (1)' }));
      assert.deepStrictEqual(menuModels(), ['m1', 'm3', 'm2']);
      fireEvent.click(screen.getByRole('button', { name: 'Hide more' }));
      assert.deepStrictEqual(menuModels(), ['m1', 'm3']);
    });

    it('search matches Hidden models after unhidden ones', () => {
      mount({ configOptions: modelOptions('m1'), settings: { hiddenModels: { 'codex-acp': ['m2'] } } });
      fireEvent.click(chip(1));
      fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'm' } });
      assert.deepStrictEqual(menuModels(), ['m1', 'm3', 'm2']);
    });

    it('sets the picked model', () => {
      const { changes } = mount({ configOptions: modelOptions('m1') });
      fireEvent.click(chip(1));
      fireEvent.click(screen.getByRole('menuitem', { name: 'm2' }));
      assert.deepStrictEqual(changes, [{ configId: 'model', type: 'select', value: 'm2' }]);
    });

    it('Virtual search spans launch targets and picking another target reports it', () => {
      const picks: string[] = [];
      mount({
        configOptions: modelOptions('m1'),
        modelSearch: {
          getConfigOptionIndex: target =>
            target === 'claude-agent-acp'
              ? {
                  byModel: { opus: [select('model', 'opus', ['opus'])] },
                  defaultModelId: 'opus',
                  unavailableModelIds: [],
                }
              : undefined,
          launchTargets: ['codex-acp', 'claude-agent-acp'],
          onPickModelOnTarget: (target, modelId) => picks.push(`${target}:${modelId}`),
        },
      });
      fireEvent.click(chip(1));
      fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'opus' } });
      const row = screen.getByRole('menuitem');
      assert.include(row.textContent, 'Claude');
      fireEvent.click(row);
      assert.deepStrictEqual(picks, ['claude-agent-acp:opus']);
    });

    it('shows Ultra enabled when the model advertises ultra, and restores effort on off', () => {
      const { changes } = mount({
        configOptions: [select('model', 'gpt', ['gpt']), select('reasoning_effort', 'high', ['high', 'ultra'])],
      });
      fireEvent.click(chip(1));
      fireEvent.click(screen.getByLabelText('Ultra'));
      assert.deepStrictEqual(changes, [{ configId: 'reasoning_effort', type: 'select', value: 'ultra' }]);
    });

    it('disables Ultra when unsupported and hides ultra from Reasoning', () => {
      mount({ configOptions: [select('model', 'gpt', ['gpt']), select('reasoning_effort', 'high', ['high'])] });
      fireEvent.click(chip(1));
      assert.isTrue(screen.getByLabelText<HTMLInputElement>('Ultra').disabled);
    });

    it('renders the Plan toggle for collaboration_mode', () => {
      const { changes } = mount({
        configOptions: [select('model', 'gpt', ['gpt']), select('collaboration_mode', 'default', ['default', 'plan'])],
      });
      fireEvent.click(chip(1));
      fireEvent.click(screen.getByLabelText('Plan'));
      assert.deepStrictEqual(changes, [{ configId: 'collaboration_mode', type: 'select', value: 'plan' }]);
    });
  });
});
