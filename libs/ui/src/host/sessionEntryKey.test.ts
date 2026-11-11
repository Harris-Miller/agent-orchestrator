import { assert, describe, it } from '@effect/vitest';

import { sessionEntryKey, withoutPinned } from './sessionEntryKey.ts';

const row = (launchTarget: 'claude-agent-acp' | 'codex-acp', sessionId: string) => ({ launchTarget, sessionId });

describe('sessionEntryKey', () => {
  it('tells apart the same sessionId on different launch targets', () => {
    assert.notStrictEqual(sessionEntryKey(row('claude-agent-acp', 's1')), sessionEntryKey(row('codex-acp', 's1')));
  });
});

describe('withoutPinned', () => {
  it('drops pinned rows by launch target and session id, keeping order', () => {
    const entries = [row('claude-agent-acp', 's1'), row('codex-acp', 's1'), row('claude-agent-acp', 's2')];
    assert.deepStrictEqual(withoutPinned(entries, [row('codex-acp', 's1')]), [
      row('claude-agent-acp', 's1'),
      row('claude-agent-acp', 's2'),
    ]);
    assert.deepStrictEqual(withoutPinned(entries, []), entries);
  });
});
