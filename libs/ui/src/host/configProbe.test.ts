import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { layerNoop } from 'effect/FileSystem';

import type { NormalizedSelectConfigOption } from './acpSessionBootstrap.ts';
import {
  configOptionIndexFromProbeResponses,
  configOptionIndexIsNonempty,
  configValuesFromOptions,
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

const probeServices = layerNoop({
  makeTempDirectory: () => Effect.succeed('/tmp/ao-config-probe-test'),
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
        ],
      },
    });

    assert.strictEqual(index.defaultModelId, 'sonnet');
    assert.deepStrictEqual(
      index.byModel.sonnet.map(option => option.id),
      ['model', 'mode'],
    );
    assert.deepStrictEqual(
      index.byModel.opus.map(option => option.id),
      ['model', 'effort'],
    );
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
});

describe('configValuesFromOptions / nonempty', () => {
  it('maps currentValues and reports nonempty index', () => {
    const options = [selectOption('model', 'sonnet', ['sonnet'])];
    assert.deepStrictEqual(configValuesFromOptions(options), { model: 'sonnet' });
    assert.isTrue(configOptionIndexIsNonempty({ byModel: { sonnet: options }, defaultModelId: 'sonnet' }));
    assert.isFalse(configOptionIndexIsNonempty(undefined));
    assert.isFalse(configOptionIndexIsNonempty({ byModel: {}, defaultModelId: 'x' }));
  });
});

describe('runConfigProbe', () => {
  it.effect('builds index; close failure still returns Ready-eligible index', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const agent = {
        'session/close': () => {
          calls.push('close');
          return Effect.fail('close-failed');
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
      assert.deepStrictEqual(calls, ['new', 'set:opus', 'close']);
    }).pipe(Effect.provide(probeServices)),
  );

  it.effect('fails when session/new has no model currentValue', () =>
    Effect.gen(function* () {
      const agent = {
        'session/close': () => Effect.void,
        'session/new': () =>
          Effect.succeed({
            configOptions: [{ id: 'mode', name: 'Mode', type: 'select' }],
            sessionId: 'probe-1',
          }),
        'session/set_config_option': () => Effect.succeed({}),
      };
      const exit = yield* Effect.exit(runConfigProbe(agent));
      assert.isTrue(Exit.isFailure(exit));
    }).pipe(Effect.provide(probeServices)),
  );
});
