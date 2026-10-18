import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import {
  applyConfigDiffs,
  buildActivatedSession,
  rosterEntryFromNew,
  sessionConfigurationFromFork,
} from './sessionMaterialize.ts';
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

  it('fork carry clones parent transcript onto the new sessionId', () => {
    const parent = initialSessionSnapshot('parent', 'active');
    const withItem = {
      ...parent,
      transcript: {
        ...parent.transcript,
        items: [{ id: 'u1', kind: 'user_message' as const, text: 'hi' }],
      },
    };
    const cloned = structuredClone(withItem.transcript);
    const forked = buildActivatedSession(
      'fork',
      { configOptions: [], sessionId: 'fork' },
      {
        cwd: '/proj',
        transcript: cloned,
      },
    );
    assert.strictEqual(forked.sessionId, 'fork');
    assert.strictEqual(forked.status, 'active');
    assert.deepStrictEqual(forked.transcript.items, withItem.transcript.items);
    assert.notStrictEqual(forked.transcript, withItem.transcript);
  });
});

describe('rosterEntryFromNew', () => {
  it('builds roster entry from session/new result', () => {
    const entry = rosterEntryFromNew({ sessionId: 's1' }, '/tmp/proj');
    assert.strictEqual(entry?.sessionId, 's1');
    assert.strictEqual(entry?.cwd, '/tmp/proj');
  });
});

describe('sessionConfigurationFromFork', () => {
  const parentConfig = {
    configOptions: [{ currentValue: 'sonnet', id: 'model', name: 'Model', type: 'select' }],
    modes: { availableModes: [{ id: 'default', name: 'Manual' }], currentModeId: 'default' },
    sessionId: 'parent',
  };

  it('fills missing configOptions and modes from parent', () => {
    const merged = sessionConfigurationFromFork({ sessionId: 'fork' }, parentConfig) as Record<string, unknown>;
    assert.strictEqual(merged.sessionId, 'fork');
    assert.deepStrictEqual(merged.configOptions, parentConfig.configOptions);
    assert.deepStrictEqual(merged.modes, parentConfig.modes);
  });

  it('fills null configOptions and modes from parent', () => {
    const merged = sessionConfigurationFromFork(
      { configOptions: null, modes: null, sessionId: 'fork' },
      parentConfig,
    ) as Record<string, unknown>;
    assert.deepStrictEqual(merged.configOptions, parentConfig.configOptions);
    assert.deepStrictEqual(merged.modes, parentConfig.modes);
  });

  it('keeps fork-provided configOptions and modes', () => {
    const forkConfig = {
      configOptions: [{ currentValue: 'opus', id: 'model', name: 'Model', type: 'select' }],
      modes: { availableModes: [{ id: 'plan', name: 'Plan' }], currentModeId: 'plan' },
      sessionId: 'fork',
    };
    const merged = sessionConfigurationFromFork(forkConfig, parentConfig) as Record<string, unknown>;
    assert.deepStrictEqual(merged.configOptions, forkConfig.configOptions);
    assert.deepStrictEqual(merged.modes, forkConfig.modes);
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
