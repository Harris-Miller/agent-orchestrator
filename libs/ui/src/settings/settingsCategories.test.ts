import { assert, describe, it } from '@effect/vitest';

import { isSettingsCategoryId, SETTINGS_CATEGORIES, settingsCategoryLabel } from './settingsCategories.ts';

describe('SETTINGS_CATEGORIES', () => {
  it('includes implemented and placeholder categories', () => {
    assert.deepStrictEqual(
      SETTINGS_CATEGORIES.map(entry => entry.id),
      ['general', 'appearance', 'keyboard', 'providers', 'git', 'connections', 'about'],
    );
  });

  it('isSettingsCategoryId accepts known ids only', () => {
    assert.isTrue(isSettingsCategoryId('general'));
    assert.isFalse(isSettingsCategoryId('nope'));
  });

  it('settingsCategoryLabel resolves labels', () => {
    assert.strictEqual(settingsCategoryLabel('providers'), 'Providers');
  });
});
