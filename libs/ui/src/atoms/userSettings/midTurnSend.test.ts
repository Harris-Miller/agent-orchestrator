import { assert, describe, it } from '@effect/vitest';

import { midTurnSendMode } from './userSettingsDocument.atoms.ts';

describe('midTurnSendMode', () => {
  it('defaults to steer when unset', () => {
    assert.strictEqual(midTurnSendMode({}), 'steer');
  });

  it('is queue when set to queue', () => {
    assert.strictEqual(midTurnSendMode({ midTurnSend: 'queue' }), 'queue');
  });
});
