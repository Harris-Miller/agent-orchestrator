/** Theme preference projection over user settings + paint cache. */
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import type { ThemeId } from '../../theme/theme.ts';
import { clampThemeId, readPaintThemeId, writePaintThemeId } from '../../theme/themePaintCache.ts';

import { userSettingsAtom, userSettingsDocument } from './userSettings.atoms.ts';

/** Effective theme: paint cache while settings not Success; User settings after. Write paints + updates settings. */
export const themeAtom = Atom.writable(
  get => {
    // by using `get` against `userSettingsAtom`, we register it as a dependency of this atom, so reactivity automatically applies
    const settings = get(userSettingsAtom);
    if (!AsyncResult.isSuccess(settings)) {
      return readPaintThemeId();
    }
    const themeId = clampThemeId(settings.value.theme);
    writePaintThemeId(themeId);
    return themeId;
  },
  (ctx, id: ThemeId) => {
    writePaintThemeId(id);
    ctx.set(userSettingsAtom, { ...userSettingsDocument(ctx.get(userSettingsAtom)), theme: id });
  },
).pipe(Atom.keepAlive);
