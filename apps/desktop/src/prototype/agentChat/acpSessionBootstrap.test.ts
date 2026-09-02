import { assert, describe, it } from '@effect/vitest';

import claudeSessionNewFixture from '../../../fixtures/claude_session_new_response.json';
import codexSessionNewFixture from '../../../fixtures/codex_session_new_response.json';
import { isRecord } from '../../utils.ts';

import {
  applySetConfigOptionResult,
  normalizeModels,
  normalizeModes,
  selectionFromSessionConfiguration,
} from './acpSessionBootstrap.ts';

const fixtureSessionValue = (fixture: unknown): unknown => {
  if (!isRecord(fixture) || !isRecord(fixture.message) || !isRecord(fixture.message.exit)) {
    return undefined;
  }
  const { exit } = fixture.message;
  if (exit._tag !== 'Success' || !isRecord(exit.value)) {
    return undefined;
  }
  return exit.value;
};

const claudeSession = fixtureSessionValue(claudeSessionNewFixture);
const codexSession = fixtureSessionValue(codexSessionNewFixture);

describe('normalizeModels', () => {
  it('reads model from configOptions (Claude fixture)', () => {
    const models = normalizeModels(claudeSession);
    assert.strictEqual(models.currentId, 'sonnet');
    assert.isTrue(models.options.some(option => option.id === 'sonnet'));
  });

  it('reads model from configOptions (Codex fixture)', () => {
    const models = normalizeModels(codexSession);
    assert.strictEqual(models.currentId, 'gpt-5.6-terra');
    assert.isTrue(models.options.some(option => option.id === 'gpt-5.6-terra'));
  });

  it('returns empty options when configOptions model is absent', () => {
    const models = normalizeModels({});
    assert.strictEqual(models.currentId, undefined);
    assert.strictEqual(models.options.length, 0);
  });
});

describe('normalizeModes', () => {
  it('reads mode from configOptions (Claude fixture)', () => {
    const modes = normalizeModes(claudeSession);
    assert.strictEqual(modes.currentId, 'default');
    assert.isTrue(modes.options.some(option => option.id === 'plan'));
  });

  it('reads mode from configOptions (Codex fixture)', () => {
    const modes = normalizeModes(codexSession);
    assert.strictEqual(modes.currentId, 'agent');
    assert.isTrue(modes.options.some(option => option.id === 'agent-full-access'));
  });

  it('returns empty options when configOptions mode is absent', () => {
    const modes = normalizeModes({});
    assert.strictEqual(modes.currentId, undefined);
    assert.strictEqual(modes.options.length, 0);
  });
});

describe('applySetConfigOptionResult', () => {
  it('merges partial config option updates while preserving choices', () => {
    const sessionState = {
      configOptions: [
        {
          currentValue: 'old-model',
          id: 'model',
          name: 'Model',
          options: [
            { name: 'Echo Model', value: 'echo-model' },
            { name: 'Echo Model (verbose)', value: 'echo-model-verbose' },
          ],
        },
        {
          currentValue: 'old-mode',
          id: 'mode',
          name: 'Mode',
          options: [
            { name: 'Default', value: 'default' },
            { name: 'Fixture', value: 'fixture' },
          ],
        },
      ],
    };
    const result = {
      configOptions: [{ currentValue: 'echo-model-verbose', id: 'model', name: 'Model', type: 'select' }],
    };

    const applied = applySetConfigOptionResult(sessionState, result);
    const state = applied.sessionState as Record<string, unknown>;
    const configOptions = state.configOptions as readonly Record<string, unknown>[];

    assert.strictEqual(configOptions.length, 2);
    assert.strictEqual(configOptions[0].id, 'model');
    assert.strictEqual(configOptions[0].currentValue, 'echo-model-verbose');
    assert.strictEqual((configOptions[0].options as readonly unknown[]).length, 2);
    assert.strictEqual(configOptions[1].id, 'mode');
    assert.strictEqual(configOptions[1].currentValue, 'old-mode');
    assert.strictEqual(applied.selectedModelId, 'echo-model-verbose');
    assert.strictEqual(applied.selectedModeId, 'old-mode');
  });
});

describe('selectionFromSessionConfiguration', () => {
  it('derives model and mode selection from configOptions', () => {
    const selection = selectionFromSessionConfiguration(claudeSession);
    assert.strictEqual(selection.selectedModelId, 'sonnet');
    assert.strictEqual(selection.selectedModeId, 'default');
  });
});
