import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { applyConfigDiffs, buildActivatedSession, historyEntryFromNew } from './sessionMaterialize.ts';
import type { ConfigValueDiff } from './sessionMaterialize.ts';

describe('buildActivatedSession cwd continuity', () => {
  it('preserves existing snapshot cwd through activation merge', () => {
    const existing = {
      cwd: '/proj',
      sessionId: 's1',
      status: 'activating' as const,
      transcript: initialSessionSnapshot('s1').transcript,
    };
    const next = buildActivatedSession('s1', { configOptions: [] }, existing);
    assert.strictEqual(next.cwd, '/proj');
    assert.strictEqual(next.status, 'active');
  });

  it('create-shaped stamp via existing cwd keeps cwd after later merge', () => {
    const created = buildActivatedSession('s1', { configOptions: [] }, { cwd: '/proj' });
    assert.strictEqual(created.cwd, '/proj');
    const remapped = buildActivatedSession('s1', { models: [] }, created);
    assert.strictEqual(remapped.cwd, '/proj');
  });
});

describe('historyEntryFromNew', () => {
  it('builds history entry from session/new result', () => {
    const entry = historyEntryFromNew({ sessionId: 's1' }, '/tmp/proj');
    assert.strictEqual(entry?.sessionId, 's1');
    assert.strictEqual(entry?.cwd, '/tmp/proj');
  });
});

const selectableConfig = {
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
      options: [
        { name: 'Default', value: 'default' },
        { name: 'Plan', value: 'plan' },
      ],
      type: 'select',
    },
  ],
};

describe('applyConfigDiffs', () => {
  it.effect('empty diffs leaves configuration unchanged', () =>
    Effect.gen(function* () {
      const calls: ConfigValueDiff[] = [];
      const result = yield* applyConfigDiffs(selectableConfig, { model: 'sonnet' }, diff => {
        calls.push(diff);
        return Effect.succeed({ configOptions: [] });
      });
      assert.strictEqual(result.stoppedEarly, false);
      assert.strictEqual(result.sessionConfiguration, selectableConfig);
      assert.deepStrictEqual(calls, []);
    }),
  );

  it.effect('applies all succeeding diffs and folds configuration', () =>
    Effect.gen(function* () {
      const calls: ConfigValueDiff[] = [];
      let model = 'sonnet';
      let mode = 'default';
      const result = yield* applyConfigDiffs(selectableConfig, { mode: 'plan', model: 'opus' }, diff => {
        calls.push(diff);
        if (diff.type === 'select' && diff.configId === 'model') {
          model = diff.value;
        }
        if (diff.type === 'select' && diff.configId === 'mode') {
          mode = diff.value;
        }
        return Effect.succeed({
          configOptions: [
            {
              currentValue: model,
              id: 'model',
              name: 'Model',
              options: [
                { name: 'Sonnet', value: 'sonnet' },
                { name: 'Opus', value: 'opus' },
              ],
              type: 'select',
            },
            {
              currentValue: mode,
              id: 'mode',
              name: 'Mode',
              options: [
                { name: 'Default', value: 'default' },
                { name: 'Plan', value: 'plan' },
              ],
              type: 'select',
            },
          ],
        });
      });
      assert.strictEqual(result.stoppedEarly, false);
      assert.deepStrictEqual(calls, [
        { configId: 'model', type: 'select', value: 'opus' },
        { configId: 'mode', type: 'select', value: 'plan' },
      ]);
      const config = result.sessionConfiguration as {
        configOptions: { currentValue: string; id: string }[];
      };
      const byId = Object.fromEntries(config.configOptions.map(option => [option.id, option.currentValue]));
      assert.strictEqual(byId.model, 'opus');
      assert.strictEqual(byId.mode, 'plan');
    }),
  );

  it.effect('applies an option that only becomes valid after an earlier diff refreshes the choices', () =>
    Effect.gen(function* () {
      const optionsFor = (model: string) => [
        {
          currentValue: model,
          id: 'model',
          name: 'Model',
          options: [
            { name: 'Sonnet', value: 'sonnet' },
            { name: 'Opus', value: 'opus' },
          ],
          type: 'select',
        },
        {
          currentValue: 'low',
          id: 'effort',
          name: 'Effort',
          options: model === 'opus' ? [{ value: 'low' }, { value: 'high' }] : [{ value: 'low' }],
          type: 'select',
        },
      ];
      const calls: ConfigValueDiff[] = [];
      const result = yield* applyConfigDiffs(
        { configOptions: optionsFor('sonnet') },
        { effort: 'high', model: 'opus' },
        diff => {
          calls.push(diff);
          return Effect.succeed({
            configOptions:
              diff.configId === 'model' ? optionsFor('opus') : [{ ...optionsFor('opus')[1], currentValue: diff.value }],
          });
        },
      );
      assert.strictEqual(result.stoppedEarly, false);
      assert.deepStrictEqual(calls, [
        { configId: 'model', type: 'select', value: 'opus' },
        { configId: 'effort', type: 'select', value: 'high' },
      ]);
    }),
  );

  it.effect('applies boolean diffs', () =>
    Effect.gen(function* () {
      const config = {
        configOptions: [
          ...selectableConfig.configOptions,
          { currentValue: false, id: 'fast-mode', name: 'Fast mode', type: 'boolean' },
        ],
      };
      const calls: ConfigValueDiff[] = [];
      const result = yield* applyConfigDiffs(config, { 'fast-mode': true }, diff => {
        calls.push(diff);
        return Effect.succeed({
          configOptions: [{ currentValue: diff.value, id: diff.configId, name: diff.configId, type: 'boolean' }],
        });
      });
      assert.strictEqual(result.stoppedEarly, false);
      assert.deepStrictEqual(calls, [{ configId: 'fast-mode', type: 'boolean', value: true }]);
    }),
  );

  it.effect('stops on first failure and keeps partial configuration', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const result = yield* applyConfigDiffs(selectableConfig, { mode: 'plan', model: 'opus' }, diff => {
        calls.push(diff.configId);
        if (diff.configId === 'model') {
          return Effect.fail('boom' as const);
        }
        return Effect.succeed({
          configOptions: [
            {
              currentValue: diff.value,
              id: diff.configId,
              name: diff.configId,
              options: [{ name: String(diff.value), value: String(diff.value) }],
              type: 'select',
            },
          ],
        });
      });
      assert.strictEqual(result.stoppedEarly, true);
      assert.deepStrictEqual(calls, ['model']);
      assert.strictEqual(result.sessionConfiguration, selectableConfig);
    }),
  );
});
