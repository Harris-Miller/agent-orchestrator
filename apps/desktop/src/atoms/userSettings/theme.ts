/** Theme preference projection over user settings + paint cache. */
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import type { ThemeId } from '../../theme/theme.ts';
import { clampThemeId, readPaintThemeId, writePaintThemeId } from '../../theme/themePaintCache.ts';
import { acpRuntime } from '../acpRuntime.ts';

import { settingsHydratedAtom, userSettingsAtom, writeUserSettingsAtomFn } from './userSettings.ts';

/** Effective theme: paint cache before hydrate, settings document after. */
export const themeAtom = Atom.make(get => {
  if (!get(settingsHydratedAtom)) {
    return readPaintThemeId();
  }
  const themeId = clampThemeId(get(userSettingsAtom).theme);
  writePaintThemeId(themeId);
  return themeId;
}).pipe(Atom.keepAlive);

export const setThemeAtomFn = acpRuntime
  .fn(
    Effect.fn('setThemeAtomFn')(function* (id: ThemeId, get: Atom.FnContext) {
      writePaintThemeId(id);
      const settings = get(userSettingsAtom);
      yield* get.setResult(writeUserSettingsAtomFn, { ...settings, theme: id });
    }),
  )
  .pipe(Atom.keepAlive);
