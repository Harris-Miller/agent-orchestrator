import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { applyConfigDiffs, buildActivatedSession, rosterEntryFromNew } from './sessionMaterialize.ts';

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

describe('rosterEntryFromNew', () => {
  it('builds roster entry from session/new result', () => {
    const entry = rosterEntryFromNew({ sessionId: 's1' }, '/tmp/proj');
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
      const calls: { configId: string; value: string }[] = [];
      const result = yield* applyConfigDiffs(selectableConfig, { model: 'sonnet' }, (configId, value) => {
        calls.push({ configId, value });
        return Effect.succeed({ configOptions: [] });
      });
      assert.strictEqual(result.stoppedEarly, false);
      assert.strictEqual(result.sessionConfiguration, selectableConfig);
      assert.deepStrictEqual(calls, []);
    }),
  );

  it.effect('applies all succeeding diffs and folds configuration', () =>
    Effect.gen(function* () {
      const calls: { configId: string; value: string }[] = [];
      const result = yield* applyConfigDiffs(selectableConfig, { mode: 'plan', model: 'opus' }, (configId, value) => {
        calls.push({ configId, value });
        return Effect.succeed({
          configOptions: [
            {
              currentValue: value,
              id: configId,
              name: configId,
              options: [
                { name: value, value },
                { name: 'other', value: 'other' },
              ],
              type: 'select',
            },
          ],
        });
      });
      assert.strictEqual(result.stoppedEarly, false);
      assert.deepStrictEqual(calls, [
        { configId: 'model', value: 'opus' },
        { configId: 'mode', value: 'plan' },
      ]);
      const config = result.sessionConfiguration as {
        configOptions: { currentValue: string; id: string }[];
      };
      const byId = Object.fromEntries(config.configOptions.map(option => [option.id, option.currentValue]));
      assert.strictEqual(byId.model, 'opus');
      assert.strictEqual(byId.mode, 'plan');
    }),
  );

  it.effect('stops on first failure and keeps partial configuration', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const result = yield* applyConfigDiffs(selectableConfig, { mode: 'plan', model: 'opus' }, (configId, value) => {
        calls.push(configId);
        if (configId === 'model') {
          return Effect.fail('boom' as const);
        }
        return Effect.succeed({
          configOptions: [
            {
              currentValue: value,
              id: configId,
              name: configId,
              options: [{ name: value, value }],
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
