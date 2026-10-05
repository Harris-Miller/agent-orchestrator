import { assert, describe, it } from '@effect/vitest';

import {
  configOptionsFromSnapshot,
  rewriteSessionConfiguration,
  snapshotSessionConfig,
  withModeId,
  withModelId,
} from './rewriteSessionConfiguration.ts';

const geminiNew = {
  models: {
    availableModels: [
      { description: 'Auto pick', modelId: 'auto-gemini-2.5', name: 'Auto (Gemini 2.5)' },
      { modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    ],
    currentModelId: 'auto-gemini-2.5',
  },
  modes: {
    availableModes: [
      { description: 'Prompts for approval', id: 'default', name: 'Default' },
      { description: 'Auto-approves all tools', id: 'yolo', name: 'YOLO' },
    ],
    currentModeId: 'default',
  },
  sessionId: 'sess-1',
};

describe('rewriteSessionConfiguration', () => {
  it('synthesizes mode and model configOptions from Gemini models/modes', () => {
    const rewritten = rewriteSessionConfiguration(geminiNew);

    assert.strictEqual(rewritten.sessionId, 'sess-1');
    assert.strictEqual('models' in rewritten, false);
    assert.deepStrictEqual(rewritten.modes, geminiNew.modes);

    const options = rewritten.configOptions as readonly Record<string, unknown>[];
    assert.strictEqual(options.length, 2);
    assert.deepStrictEqual(options[0], {
      category: 'mode',
      currentValue: 'default',
      description: 'Session permission mode',
      id: 'mode',
      name: 'Mode',
      options: [
        { description: 'Prompts for approval', name: 'Default', value: 'default' },
        { description: 'Auto-approves all tools', name: 'YOLO', value: 'yolo' },
      ],
      type: 'select',
    });
    assert.deepStrictEqual(options[1], {
      category: 'model',
      currentValue: 'auto-gemini-2.5',
      description: 'AI model to use',
      id: 'model',
      name: 'Model',
      options: [
        { description: 'Auto pick', name: 'Auto (Gemini 2.5)', value: 'auto-gemini-2.5' },
        { name: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
      ],
      type: 'select',
    });
  });

  it('keeps existing configOptions ids and still drops models', () => {
    const rewritten = rewriteSessionConfiguration({
      configOptions: [
        {
          category: 'model',
          currentValue: 'already',
          id: 'model',
          name: 'Model',
          options: [{ name: 'Already', value: 'already' }],
          type: 'select',
        },
      ],
      models: geminiNew.models,
      modes: geminiNew.modes,
      sessionId: 'sess-1',
    });

    assert.strictEqual('models' in rewritten, false);
    const options = rewritten.configOptions as readonly Record<string, unknown>[];
    assert.strictEqual(options.length, 2);
    assert.strictEqual(options[0]?.id, 'mode');
    assert.strictEqual(options[1]?.id, 'model');
    assert.strictEqual(options[1]?.currentValue, 'already');
  });

  it('snapshot helpers rebuild configOptions after model/mode changes', () => {
    const snapshot = snapshotSessionConfig(geminiNew);
    const afterModel = withModelId(snapshot, 'gemini-2.5-pro');
    const afterMode = withModeId(afterModel, 'yolo');
    const { configOptions } = configOptionsFromSnapshot(afterMode);
    const byId: Record<string, unknown> = Object.fromEntries(
      (configOptions as readonly Record<string, unknown>[]).map(option => [String(option.id), option.currentValue]),
    );
    assert.deepStrictEqual(byId, { mode: 'yolo', model: 'gemini-2.5-pro' });
  });
});
