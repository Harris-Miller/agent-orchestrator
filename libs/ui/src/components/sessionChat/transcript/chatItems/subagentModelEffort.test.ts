import { assert, describe, it } from '@effect/vitest';

import type { NormalizedConfigOption } from '../../../../host/acpSessionBootstrap.ts';
import { subagentModelEffortLabel } from './subagentModelEffort.ts';

const model: NormalizedConfigOption = {
  choices: [{ id: 'opus', name: 'Opus' }],
  currentValue: 'opus',
  id: 'model',
  name: 'Model',
  type: 'select',
};
const effort: NormalizedConfigOption = {
  choices: [{ id: 'high', name: 'High' }],
  currentValue: 'high',
  id: 'effort',
  name: 'Effort',
  type: 'select',
};

describe('subagentModelEffortLabel', () => {
  it('joins model and effort', () => {
    assert.strictEqual(subagentModelEffortLabel('claude-agent-acp', [model, effort]), 'Opus · High');
  });

  it('shows the model alone without an effort option', () => {
    assert.strictEqual(subagentModelEffortLabel('claude-agent-acp', [model]), 'Opus');
  });

  it('is undefined without a model option', () => {
    assert.isUndefined(subagentModelEffortLabel('claude-agent-acp', [effort]));
  });

  it('is undefined for an empty configuration', () => {
    assert.isUndefined(subagentModelEffortLabel('claude-agent-acp', []));
  });
});
