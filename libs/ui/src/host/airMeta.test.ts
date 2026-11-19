import { assert, describe, it } from '@effect/vitest';

import { Option } from 'effect';

import {
  airCapability,
  isArchivedEntry,
  isLoadReplayEnd,
  isSkillCommand,
  recommendedValueOf,
  sessionFailureOf,
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
