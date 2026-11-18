import { assert, describe, it } from '@effect/vitest';

import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';

import { partitionForBulk, pruneSelection, selectAllKeys, toggleKey } from './bulkSelection.ts';

const entry = (sessionId: string, archived = false): UnifiedHistoryEntry => ({
  cwd: '/proj',
  launchTarget: 'codex-acp',
  sessionId,
  ...(archived ? { _meta: { jetbrains: { air: { archived: true, version: 1 } } } } : {}),
});

describe('bulkSelection', () => {
  it('prunes keys that are no longer visible', () => {
    const kept = pruneSelection(new Set(['codex-acp:a', 'codex-acp:gone']), [entry('a'), entry('b')]);
    assert.deepStrictEqual([...kept], ['codex-acp:a']);
  });

  it('toggles a key in and out', () => {
    const on = toggleKey(new Set(), 'k');
    assert.isTrue(on.has('k'));
    assert.isFalse(toggleKey(on, 'k').has('k'));
  });

  it('selects all entries by key', () => {
    assert.deepStrictEqual([...selectAllKeys([entry('a'), entry('b')])], ['codex-acp:a', 'codex-acp:b']);
  });

  it('partitions archive vs unarchive candidates', () => {
    const parts = partitionForBulk([entry('a'), entry('b', true)], () => true);
    assert.deepStrictEqual(
      parts.archivable.map(e => e.sessionId),
      ['a'],
    );
    assert.deepStrictEqual(
      parts.unarchivable.map(e => e.sessionId),
      ['b'],
    );
    assert.strictEqual(parts.all.length, 2);
  });

  it('leaves out entries whose agent cannot archive, but keeps them for delete', () => {
    const parts = partitionForBulk([entry('a'), entry('b', true)], () => false);
    assert.strictEqual(parts.archivable.length, 0);
    assert.strictEqual(parts.unarchivable.length, 0);
    assert.strictEqual(parts.all.length, 2);
  });
});
