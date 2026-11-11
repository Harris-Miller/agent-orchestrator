import { assert, describe, it } from '@effect/vitest';

import { selectEffectiveTheme } from './effectiveTheme.ts';
import { DEFAULT_THEME_FONT, ORIGINAL_COLORS } from './themes.ts';

const hostTheme = { colors: ORIGINAL_COLORS, font: DEFAULT_THEME_FONT };

describe('selectEffectiveTheme', () => {
  it('uses the preset on desktop even when matching is on', () => {
    const effective = selectEffectiveTheme({ hostTheme: undefined, matchVscodeTheme: true, themeId: 'mocha' });

    assert.deepStrictEqual(effective, { _tag: 'Preset', id: 'mocha' });
  });

  it('uses the Host theme in VS Code with matching on', () => {
    const effective = selectEffectiveTheme({ hostTheme, matchVscodeTheme: true, themeId: 'mocha' });

    assert.strictEqual(effective._tag, 'Host');
    if (effective._tag === 'Host') {
      assert.strictEqual(effective.theme, hostTheme);
    }
  });

  it('uses the preset in VS Code with matching off', () => {
    const effective = selectEffectiveTheme({ hostTheme, matchVscodeTheme: false, themeId: 'latte' });

    assert.deepStrictEqual(effective, { _tag: 'Preset', id: 'latte' });
  });
});
