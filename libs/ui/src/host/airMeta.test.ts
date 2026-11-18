import { assert, describe, it } from '@effect/vitest';

import { isArchivedEntry, isSkillCommand } from './airMeta.ts';

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
