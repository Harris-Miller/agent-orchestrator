import { assert, describe, it } from '@effect/vitest';

import { matchVscodeThemeEnabled } from './userSettings.atoms.ts';

describe('matchVscodeThemeEnabled', () => {
  it('defaults to true when unset', () => {
    assert.isTrue(matchVscodeThemeEnabled({}));
  });

  it('is true when explicitly true', () => {
    assert.isTrue(matchVscodeThemeEnabled({ matchVscodeTheme: true }));
  });

  it('is false only when explicitly false', () => {
    assert.isFalse(matchVscodeThemeEnabled({ matchVscodeTheme: false }));
  });
});
