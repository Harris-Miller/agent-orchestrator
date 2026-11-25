import { Atom } from 'effect/reactivity';

import { selectEffectiveTheme } from '../theme/effectiveTheme.ts';
import type { ThemeId } from '../theme/themes.ts';
import type { HostTheme } from '../theme/vscodeTheme.ts';

/**
 * The theme the Host reads from its own app, written by the Host app (VS Code reads its active color theme).
 * `undefined` when the Host has none, as on desktop, which also hides the Match VS Code theme switch.
 */
export const hostThemeAtom = Atom.make<HostTheme | undefined>(undefined).pipe(
  Atom.withLabel('hostTheme'),
  Atom.keepAlive,
);

/**
 * Whether the OS prefers a dark color scheme, live. Never written to User settings. `false` where `matchMedia` is
 * unavailable.
 */
export const osPrefersDarkAtom = Atom.make<boolean>(get => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (event: MediaQueryListEvent) => {
    get.setSelf(event.matches);
  };
  media.addEventListener('change', onChange);
  get.addFinalizer(() => {
    media.removeEventListener('change', onChange);
  });
  return media.matches;
}).pipe(Atom.withLabel('osPrefersDark'), Atom.keepAlive);

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
