import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { layerNoop } from 'effect/FileSystem';

import { effortOption, modelSelectOption, rowIds } from './configOptionIndexFixtures.ts';
import type { NormalizedBooleanConfigOption, NormalizedSelectConfigOption } from './acpSessionBootstrap.ts';
import {
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

const booleanOption = (id: string, currentValue: boolean): NormalizedBooleanConfigOption => ({
  currentValue,
  id,
  name: id,
  type: 'boolean',
});

const probeServices = layerNoop({
  makeTempDirectory: () => Effect.succeed('/tmp/hoa-config-probe-test'),
  remove: () => Effect.void,
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

  it('falls back to the recommended value (else current) for an invalid prior select value', () => {
    const effort = { ...selectOption('effort', 'low', ['low', 'high']), recommendedValue: 'high' };
    assert.deepStrictEqual(
      preserveConfigValuesOnModelChange({ effort: 'stale', model: 'opus' }, [
        selectOption('model', 'opus', ['sonnet', 'opus']),
        effort,
      ]),
      { effort: 'high', model: 'opus' },
    );
    const badRecommendation = { ...effort, recommendedValue: 'nope' };
    assert.deepStrictEqual(preserveConfigValuesOnModelChange({ model: 'opus' }, [badRecommendation]), {
      effort: 'low',
    });
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
  const makeAgent = (calls: string[], response: unknown, closeFails = false) => ({
    'session/close': () => {
      calls.push('close');
      return closeFails ? Effect.fail('close-failed') : Effect.void;
    },
    'session/delete': () => {
      calls.push('delete');
      return closeFails ? Effect.fail('delete-failed') : Effect.void;
    },
    'session/new': () => {
      calls.push('new');
      return Effect.succeed({ sessionId: 'probe-1', ...(response as object) });
    },
  });

  it.effect('seeds model list and default row from one session/new; close/delete failure still returns index', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const agent = makeAgent(
        calls,
        { configOptions: [modelSelectOption('sonnet', ['sonnet', 'opus']), effortOption('high')] },
        true,
      );

      const index = yield* runConfigProbe(agent);
      assert.strictEqual(index.defaultModelId, 'sonnet');
      assert.deepStrictEqual(Object.keys(index.byModel), ['sonnet']);
      assert.deepStrictEqual(rowIds(index, 'sonnet'), ['model', 'effort']);
      assert.deepStrictEqual(index.unavailableModelIds, []);
      assert.deepStrictEqual(calls, ['new', 'close', 'delete']);
    }).pipe(Effect.provide(probeServices)),
  );

  it.effect('fails when session/new has no model currentValue; still cleans up', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const agent = makeAgent(calls, { configOptions: [{ id: 'mode', name: 'Mode', type: 'select' }] });
      const exit = yield* Effect.exit(runConfigProbe(agent));
      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(calls, ['new', 'close', 'delete']);
    }).pipe(Effect.provide(probeServices)),
  );
});
