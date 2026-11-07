import { assert, describe, it } from '@effect/vitest';

import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { buildActivatedSession, historyEntryFromNew } from './sessionMaterialize.ts';

describe('buildActivatedSession cwd continuity', () => {
  it('preserves existing snapshot cwd through activation merge', () => {
    const existing = {
      cwd: '/proj',
      sessionId: 's1',
      status: 'activating' as const,
      transcript: initialSessionSnapshot('s1').transcript,
    };
    const next = buildActivatedSession('s1', [], existing);
    assert.strictEqual(next.cwd, '/proj');
    assert.strictEqual(next.status, 'active');
  });

  it('create-shaped stamp via existing cwd keeps cwd after later merge', () => {
    const created = buildActivatedSession('s1', [], { cwd: '/proj' });
    assert.strictEqual(created.cwd, '/proj');
    const remapped = buildActivatedSession('s1', [], created);
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
