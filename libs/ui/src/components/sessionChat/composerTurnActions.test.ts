import { assert, describe, it } from '@effect/vitest';

import { composerTurnActions } from './composerTurnActions.ts';

const base = {
  canCancelPromptTurn: true,
  hasPendingInteraction: false,
  hasSendableContent: true,
  steeringSupported: true,
} as const;

describe('composerTurnActions', () => {
  it('steers when a prompt is in flight, steering is supported, and the composer has content', () => {
    assert.deepStrictEqual(composerTurnActions(base), { canSteer: true, primaryAction: 'steer' });
  });

  it('keeps Stop when the composer is empty', () => {
    assert.deepStrictEqual(composerTurnActions({ ...base, hasSendableContent: false }), {
      canSteer: false,
      primaryAction: 'stop',
    });
  });

  it('keeps Stop when steering is not supported, even with content', () => {
    assert.deepStrictEqual(composerTurnActions({ ...base, steeringSupported: false }), {
      canSteer: false,
      primaryAction: 'stop',
    });
  });

  it('keeps Stop while a permission or elicitation is pending', () => {
    assert.deepStrictEqual(composerTurnActions({ ...base, hasPendingInteraction: true }), {
      canSteer: false,
      primaryAction: 'stop',
    });
  });

  it('is plain send when no prompt is in flight', () => {
    assert.deepStrictEqual(composerTurnActions({ ...base, canCancelPromptTurn: false }), {
      canSteer: false,
      primaryAction: 'send',
    });
  });
});
