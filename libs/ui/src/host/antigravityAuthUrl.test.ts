import { assert, describe, it } from '@effect/vitest';

import { ANTIGRAVITY_AUTH_URL_MARKER_PREFIX, parseAntigravityAuthUrlMarker } from './antigravityAuthUrl.ts';

describe('parseAntigravityAuthUrlMarker', () => {
  it('extracts URL after marker prefix', () => {
    assert.strictEqual(
      parseAntigravityAuthUrlMarker(`${ANTIGRAVITY_AUTH_URL_MARKER_PREFIX}https://accounts.google.com/o/oauth2`),
      'https://accounts.google.com/o/oauth2',
    );
  });

  it('ignores unrelated lines and empty URLs', () => {
    assert.strictEqual(parseAntigravityAuthUrlMarker('noise'), undefined);
    assert.strictEqual(parseAntigravityAuthUrlMarker(ANTIGRAVITY_AUTH_URL_MARKER_PREFIX), undefined);
    assert.strictEqual(parseAntigravityAuthUrlMarker(`${ANTIGRAVITY_AUTH_URL_MARKER_PREFIX}   `), undefined);
  });
});
