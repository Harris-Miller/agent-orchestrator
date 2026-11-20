import { assert, describe, it } from '@effect/vitest';

import { Option } from 'effect';

import {
  airCapability,
  airRowMetaOf,
  isArchivedEntry,
  isLoadReplayEnd,
  isSkillCommand,
  recommendedValueOf,
  sessionFailureOf,
  withLastPromptAt,
} from './airMeta.ts';

describe('isLoadReplayEnd', () => {
  it('is true only for _meta.jetbrains.air.loadReplayEnd === true', () => {
    assert.isTrue(isLoadReplayEnd({ _meta: { jetbrains: { air: { loadReplayEnd: true, version: 1 } } } }));
    assert.isFalse(isLoadReplayEnd({ _meta: { jetbrains: { air: { loadReplayEnd: false } } } }));
    assert.isFalse(isLoadReplayEnd({ _meta: { jetbrains: { air: {} } } }));
    assert.isFalse(isLoadReplayEnd({ title: 'x' }));
  });
});

describe('isArchivedEntry', () => {
  it('reads _meta.jetbrains.air.archived', () => {
    assert.isTrue(isArchivedEntry({ _meta: { jetbrains: { air: { archived: true } } } }));
    assert.isFalse(isArchivedEntry({ _meta: { jetbrains: { air: { archived: false } } } }));
    assert.isFalse(isArchivedEntry({ _meta: { provider: { archived: true } } }));
    assert.isFalse(isArchivedEntry({}));
  });
});

describe('isSkillCommand', () => {
  it('detects skills from AIR meta or the Codex $ namespace', () => {
    const air = (body: object) => ({ _meta: { jetbrains: { air: body } }, name: 'caveman' });
    assert.isTrue(isSkillCommand(air({ kind: 'skill' })));
    assert.isTrue(isSkillCommand(air({ skillPath: '/a/SKILL.md' })));
    assert.isTrue(isSkillCommand({ name: '$caveman' }));
    assert.isFalse(isSkillCommand({ name: 'status' }));
    assert.isFalse(isSkillCommand({ _meta: 'x', name: 'status' }));
    assert.isFalse(isSkillCommand(air({ version: 1 })));
  });
});

describe('sessionFailureOf', () => {
  const failure = {
    actions: ['retry'],
    category: 'connection',
    id: 'f1',
    revision: 1,
    severity: 'warning',
    title: 'T',
  };
  const wrap = (sessionFailure: unknown) => ({ jetbrains: { air: { sessionFailure } } });

  it('reads _meta.jetbrains.air.sessionFailure', () => {
    const found = sessionFailureOf(wrap(failure));
    assert.isTrue(Option.isSome(found));
    assert.strictEqual(Option.getOrThrow(found).id, 'f1');
  });

  it('is None when absent or malformed', () => {
    assert.isTrue(Option.isNone(sessionFailureOf(undefined)));
    assert.isTrue(Option.isNone(sessionFailureOf({ jetbrains: { air: {} } })));
    assert.isTrue(Option.isNone(sessionFailureOf(wrap({ ...failure, id: '' }))));
  });

  it('is a named AIR capability', () => {
    assert.strictEqual(airCapability.sessionFailure, 'sessionFailure');
    assert.strictEqual(airCapability.backgroundSubagents, 'backgroundSubagents');
  });
});

describe('recommendedValueOf', () => {
  it('reads a string _meta.jetbrains.air.recommendedValue', () => {
    assert.strictEqual(recommendedValueOf({ _meta: { jetbrains: { air: { recommendedValue: 'opus' } } } }), 'opus');
  });

  it('is undefined when absent or not a string', () => {
    assert.isUndefined(recommendedValueOf({ _meta: { jetbrains: { air: {} } } }));
    assert.isUndefined(recommendedValueOf({ _meta: { jetbrains: { air: { recommendedValue: 3 } } } }));
    assert.isUndefined(recommendedValueOf({ id: 'model' }));
  });

  it('is a named AIR capability', () => {
    assert.strictEqual(airCapability.recommendedValue, 'recommendedValue');
  });
});

describe('airRowMetaOf', () => {
  const air = (body: object) => ({ _meta: { jetbrains: { air: body } } });

  it('reads every field', () => {
    assert.deepStrictEqual(
      airRowMetaOf(
        air({
          cost: { amount: 1.5, currency: 'USD' },
          forkedFrom: 'parent',
          lastPromptAt: '2026-01-01T00:00:00.000Z',
          model: 'opus',
          state: 'requires_action',
        }),
      ),
      {
        activityState: 'requires_action',
        cost: { amount: 1.5, currency: 'USD' },
        forkSource: 'parent',
        lastPromptTime: '2026-01-01T00:00:00.000Z',
        model: 'opus',
      },
    );
  });

  it('reads rows without meta as empty', () => {
    assert.deepStrictEqual(airRowMetaOf({}), {});
    assert.deepStrictEqual(airRowMetaOf({ _meta: { provider: { model: 'x' } } }), {});
    assert.deepStrictEqual(airRowMetaOf(air({ archived: true })), {});
  });

  it('drops only a malformed field', () => {
    assert.deepStrictEqual(
      airRowMetaOf(air({ cost: { amount: 'x', currency: 'USD' }, lastPromptAt: 3, model: 'opus', state: 'idle' })),
      { model: 'opus' },
    );
    assert.deepStrictEqual(airRowMetaOf(air({ cost: { amount: 1 }, forkedFrom: 7, model: '' })), {});
  });
});

describe('withLastPromptAt', () => {
  const row = (lastPromptAt?: string) => ({
    _meta: {
      jetbrains: { air: { archived: true, ...(lastPromptAt === undefined ? {} : { lastPromptAt }) } },
      other: 1,
    },
    sessionId: 's',
  });

  it('advances an existing lastPromptAt and keeps the rest of _meta', () => {
    assert.deepStrictEqual(withLastPromptAt(row('2026-01-01T00:00:00.000Z'), '2026-02-01T00:00:00.000Z'), {
      _meta: {
        jetbrains: { air: { archived: true, lastPromptAt: '2026-02-01T00:00:00.000Z' } },
        other: 1,
      },
      sessionId: 's',
    });
  });

  it('never moves backwards, adds one, or accepts an invalid time', () => {
    const existing = row('2026-02-01T00:00:00.000Z');
    assert.strictEqual(withLastPromptAt(existing, '2026-01-01T00:00:00.000Z'), existing);
    assert.strictEqual(withLastPromptAt(existing, 'nope'), existing);
    const none = row();
    assert.strictEqual(withLastPromptAt(none, '2026-03-01T00:00:00.000Z'), none);
  });
});
