import { assert, describe, it } from '@effect/vitest';
import { Atom, AtomRegistry } from 'effect/reactivity';

import { DEFAULT_DARK_COLORS, DEFAULT_THEME_FONT } from '../theme/themes.ts';
import type { ThemeId } from '../theme/themes.ts';

import { createThemeAtoms, hostThemeAtom } from './theme.atoms.ts';

const hostTheme = { colors: DEFAULT_DARK_COLORS, font: DEFAULT_THEME_FONT };

const makeAtoms = () => {
  const matchVscodeThemeAtom = Atom.make(true);
  const themeAtom = Atom.make<ThemeId>('mocha');
  return { matchVscodeThemeAtom, themeAtom, ...createThemeAtoms({ matchVscodeThemeAtom, themeAtom }) };
};

describe('effectiveThemeAtom', () => {
  it('is the preset on a Host that supplies no theme, as on desktop', () => {
    const { effectiveThemeAtom } = makeAtoms();
    const registry = AtomRegistry.make();

    assert.deepStrictEqual(registry.get(effectiveThemeAtom), { _tag: 'Preset', id: 'mocha' });
  });

  it('is the Host theme from the first read when the Host app seeds it, so the first paint never shows the preset', () => {
    const { effectiveThemeAtom } = makeAtoms();
    const registry = AtomRegistry.make({ initialValues: [[hostThemeAtom, hostTheme]] });

    const effective = registry.get(effectiveThemeAtom);

    assert.strictEqual(effective._tag, 'Host');
    if (effective._tag === 'Host') {
      assert.strictEqual(effective.theme, hostTheme);
    }
  });

  it('follows the Host theme and the matching setting as they change', () => {
    const { effectiveThemeAtom, matchVscodeThemeAtom } = makeAtoms();
    const registry = AtomRegistry.make();
    registry.mount(effectiveThemeAtom);

    registry.set(hostThemeAtom, hostTheme);
    assert.strictEqual(registry.get(effectiveThemeAtom)._tag, 'Host');

    registry.set(matchVscodeThemeAtom, false);
    assert.deepStrictEqual(registry.get(effectiveThemeAtom), { _tag: 'Preset', id: 'mocha' });

    registry.set(matchVscodeThemeAtom, true);
    assert.strictEqual(registry.get(effectiveThemeAtom)._tag, 'Host');
  });
});
