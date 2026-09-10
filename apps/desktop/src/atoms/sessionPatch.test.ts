import { assert, describe, it } from '@effect/vitest';

import { emptyChatAccumulator } from '../acp/sessionUpdateReducer.ts';

import { applySessionActivationResult } from './sessionPatch.ts';

describe('applySessionActivationResult cwd continuity', () => {
  it('preserves existing snapshot cwd through activation merge', () => {
    const existing = {
      cwd: '/proj',
      sessionId: 's1',
      status: 'activating' as const,
      transcript: emptyChatAccumulator(),
    };
    const next = applySessionActivationResult('s1', { configOptions: [] }, existing);
    assert.strictEqual(next.cwd, '/proj');
    assert.strictEqual(next.status, 'active');
  });

  it('create-shaped stamp via existing cwd keeps cwd after later merge', () => {
    const created = applySessionActivationResult('s1', { configOptions: [] }, { cwd: '/proj' });
    assert.strictEqual(created.cwd, '/proj');
    const remapped = applySessionActivationResult('s1', { models: [] }, created);
    assert.strictEqual(remapped.cwd, '/proj');
  });
});
