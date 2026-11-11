import { Atom } from 'effect/reactivity';

import { selectEffectiveTheme } from '../theme/effectiveTheme.ts';
import type { ThemeId } from '../theme/themeId.ts';
import type { HostTheme } from '../theme/vscodeTheme.ts';

/**
 * The theme the Host reads from its own app, written by the Host app (VS Code reads its active color theme).
 * `undefined` when the Host has none, as on desktop, which also hides the Match VS Code theme switch.
 */
export const hostThemeAtom = Atom.make<HostTheme | undefined>(undefined).pipe(
  Atom.withLabel('hostTheme'),
  Atom.keepAlive,
);

export const createThemeAtoms = (deps: {
  readonly matchVscodeThemeAtom: Atom.Atom<boolean>;
  readonly themeAtom: Atom.Atom<ThemeId>;
}) => {
  /** The theme the app shows: the Host theme while Match VS Code theme is on, else the Theme preference. */
  const effectiveThemeAtom = Atom.make(get =>
    selectEffectiveTheme({
      hostTheme: get(hostThemeAtom),
      matchVscodeTheme: get(deps.matchVscodeThemeAtom),
      themeId: get(deps.themeAtom),
    }),
  ).pipe(Atom.withLabel('effectiveTheme'), Atom.keepAlive);

  return { effectiveThemeAtom };
};
