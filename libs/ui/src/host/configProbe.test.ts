import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { layerNoop } from 'effect/FileSystem';

import type { NormalizedBooleanConfigOption, NormalizedSelectConfigOption } from './acpSessionBootstrap.ts';
import {
  configOptionIndexFromProbeResponses,
  configOptionIndexIsNonempty,
  configValuesFromOptions,
  isModelChoiceUnavailable,
  modelSelectChoiceLabel,
  preserveConfigValuesOnModelChange,
  runConfigProbe,
} from './configProbe.ts';

const selectOption = (id: string, currentValue: string, choices: readonly string[]): NormalizedSelectConfigOption => ({
  choices: choices.map(choice => ({ id: choice, name: choice })),
  currentValue,
  id,
  name: id,
  type: 'select',
});

const booleanOption = (id: string, currentValue: boolean): NormalizedBooleanConfigOption => ({
  currentValue,
  id,
  name: id,
  type: 'boolean',
});

const probeServices = layerNoop({
  makeTempDirectory: () => Effect.succeed('/tmp/ao-config-probe-test'),
  remove: () => Effect.void,
});

describe('configOptionIndexFromProbeResponses', () => {
  it('stores each model response as-is without cross-model merge', () => {
    const index = configOptionIndexFromProbeResponses('sonnet', {
      opus: {
        configOptions: [
          {
            currentValue: 'opus',
            id: 'model',
            name: 'Model',
            options: [{ name: 'Opus', value: 'opus' }],
            type: 'select',
          },
          {
            currentValue: 'max',
            id: 'effort',
            name: 'Effort',
            options: [{ name: 'Max', value: 'max' }],
            type: 'select',
          },
        ],
      },
      sonnet: {
        configOptions: [
          {
            currentValue: 'sonnet',
            id: 'model',
            name: 'Model',
            options: [
              { name: 'Sonnet', value: 'sonnet' },
              { name: 'Opus', value: 'opus' },
            ],
            type: 'select',
          },
          {
            currentValue: 'default',
            id: 'mode',
            name: 'Mode',
            options: [{ name: 'Default', value: 'default' }],
            type: 'select',
          },
          {
            currentValue: false,
            id: 'fast-mode',
            name: 'Fast mode',
            type: 'boolean',
          },
        ],
      },
    });

    assert.strictEqual(index.defaultModelId, 'sonnet');
    assert.deepStrictEqual(
      index.byModel.sonnet.map(option => option.id),
      ['model', 'mode', 'fast-mode'],
    );
    assert.deepStrictEqual(
      index.byModel.opus.map(option => option.id),
      ['model', 'effort'],
    );
    assert.deepStrictEqual(index.unavailableModelIds, []);
  });
});

describe('modelSelectChoiceLabel / isModelChoiceUnavailable', () => {
  it('marks only model select choices listed as unavailable', () => {
    assert.isTrue(isModelChoiceUnavailable('model', 'opus', ['opus']));
    assert.isFalse(isModelChoiceUnavailable('model', 'sonnet', ['opus']));
    assert.isFalse(isModelChoiceUnavailable('mode', 'opus', ['opus']));
    assert.strictEqual(modelSelectChoiceLabel('Opus', true), 'Opus (unavailable)');
    assert.strictEqual(modelSelectChoiceLabel('Opus', false), 'Opus');
  });
});

describe('preserveConfigValuesOnModelChange', () => {
  it('keeps valid picks, resets missing/invalid to currentValue, drops absent ids', () => {
    const next = preserveConfigValuesOnModelChange({ effort: 'stale', gone: 'x', mode: 'plan', model: 'opus' }, [
      selectOption('model', 'opus', ['sonnet', 'opus']),
      selectOption('mode', 'default', ['default', 'plan']),
      selectOption('effort', 'low', ['low', 'high']),
    ]);
    assert.deepStrictEqual(next, { effort: 'low', mode: 'plan', model: 'opus' });
  });

  it('preserves boolean picks across model change when option remains', () => {
    const next = preserveConfigValuesOnModelChange({ 'fast-mode': true, model: 'opus' }, [
      selectOption('model', 'opus', ['sonnet', 'opus']),
      booleanOption('fast-mode', false),
    ]);
    assert.deepStrictEqual(next, { 'fast-mode': true, model: 'opus' });
  });
});

describe('configValuesFromOptions / nonempty', () => {
  it('maps currentValues and reports nonempty index', () => {
    const options = [selectOption('model', 'sonnet', ['sonnet']), booleanOption('fast-mode', false)];
    assert.deepStrictEqual(configValuesFromOptions(options), { 'fast-mode': false, model: 'sonnet' });
    assert.isTrue(
      configOptionIndexIsNonempty({
        byModel: { sonnet: options },
        defaultModelId: 'sonnet',
        unavailableModelIds: [],
      }),
    );
    assert.isFalse(configOptionIndexIsNonempty(undefined));
    assert.isFalse(configOptionIndexIsNonempty({ byModel: {}, defaultModelId: 'x', unavailableModelIds: [] }));
  });
});

describe('runConfigProbe', () => {
  it.effect('builds index; close/delete/cleanup failure still returns Ready-eligible index', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const agent = {
        'session/close': () => {
          calls.push('close');
          return Effect.fail('close-failed');
        },
        'session/delete': () => {
          calls.push('delete');
          return Effect.fail('delete-failed');
        },
        'session/new': () => {
          calls.push('new');
          return Effect.succeed({
            configOptions: [
              {
                currentValue: 'sonnet',
                id: 'model',
                name: 'Model',
                options: [
                  { name: 'Sonnet', value: 'sonnet' },
                  { name: 'Opus', value: 'opus' },
                ],
                type: 'select',
              },
              {
                currentValue: 'default',
                id: 'mode',
                name: 'Mode',
                options: [{ name: 'Default', value: 'default' }],
                type: 'select',
              },
            ],
            sessionId: 'probe-1',
          });
        },
        'session/set_config_option': ({ value }: { value: string }) => {
          calls.push(`set:${value}`);
          return Effect.succeed({
            configOptions: [
              {
                currentValue: value,
                id: 'model',
                name: 'Model',
                options: [
                  { name: 'Sonnet', value: 'sonnet' },
                  { name: 'Opus', value: 'opus' },
                ],
                type: 'select',
              },
              {
                currentValue: 'high',
                id: 'effort',
                name: 'Effort',
                options: [{ name: 'High', value: 'high' }],
                type: 'select',
              },
            ],
          });
        },
      };

      const index = yield* runConfigProbe(agent);
      assert.strictEqual(index.defaultModelId, 'sonnet');
      assert.deepStrictEqual(
        index.byModel.sonnet.map(option => option.id),
        ['model', 'mode'],
      );
      assert.deepStrictEqual(
        index.byModel.opus.map(option => option.id),
        ['model', 'effort'],
      );
      assert.deepStrictEqual(index.unavailableModelIds, []);
      assert.deepStrictEqual(calls, ['new', 'set:opus', 'close', 'delete']);
    }).pipe(Effect.provide(probeServices)),
  );

  it.effect('soft-fails mid-loop set_config_option; continues, cleans up, marks unavailable', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const agent = {
        'session/close': () => {
          calls.push('close');
          return Effect.void;
        },
        'session/delete': () => {
          calls.push('delete');
          return Effect.void;
        },
        'session/new': () => {
          calls.push('new');
          return Effect.succeed({
            configOptions: [
              {
                currentValue: 'sonnet',
                id: 'model',
                name: 'Model',
                options: [
                  { name: 'Sonnet', value: 'sonnet' },
                  { name: 'Opus', value: 'opus' },
                  { name: 'Haiku', value: 'haiku' },
                ],
                type: 'select',
              },
            ],
            sessionId: 'probe-1',
          });
        },
        'session/set_config_option': ({ value }: { value: string }) => {
          calls.push(`set:${value}`);
          if (value === 'opus') {
            return Effect.fail({ code: -32000, message: 'Rate limit exceeded' });
          }
          return Effect.succeed({
            configOptions: [
              {
                currentValue: value,
                id: 'model',
                name: 'Model',
                options: [
                  { name: 'Sonnet', value: 'sonnet' },
                  { name: 'Opus', value: 'opus' },
                  { name: 'Haiku', value: 'haiku' },
                ],
                type: 'select',
              },
              {
                currentValue: 'high',
                id: 'effort',
                name: 'Effort',
                options: [{ name: 'High', value: 'high' }],
                type: 'select',
              },
            ],
          });
        },
      };

      const index = yield* runConfigProbe(agent);
      assert.strictEqual(index.defaultModelId, 'sonnet');
      assert.isUndefined(index.byModel.opus);
      assert.deepStrictEqual(
        index.byModel.haiku.map(option => option.id),
        ['model', 'effort'],
      );
      assert.deepStrictEqual(index.unavailableModelIds, ['opus']);
      assert.deepStrictEqual(calls, ['new', 'set:opus', 'set:haiku', 'close', 'delete']);
    }).pipe(Effect.provide(probeServices)),
  );

  it.effect('fails when session/new has no model currentValue; still cleans up', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const agent = {
        'session/close': () => {
          calls.push('close');
          return Effect.void;
        },
        'session/delete': () => {
          calls.push('delete');
          return Effect.void;
        },
        'session/new': () =>
          Effect.succeed({
            configOptions: [{ id: 'mode', name: 'Mode', type: 'select' }],
            sessionId: 'probe-1',
          }),
        'session/set_config_option': () => Effect.succeed({}),
      };
      const exit = yield* Effect.exit(runConfigProbe(agent));
      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(calls, ['close', 'delete']);
    }).pipe(Effect.provide(probeServices)),
  );
});
