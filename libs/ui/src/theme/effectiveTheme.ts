import type { Theme } from '@mui/material/styles';

import type { ThemeId } from './themeId.ts';
import { createAppTheme, themes } from './themes.ts';
import type { HostTheme } from './vscodeTheme.ts';

/** The theme the app shows: a stored preset, or the one the Host supplies. */
export type EffectiveTheme =
  | { readonly _tag: 'Host'; readonly theme: HostTheme }
  | { readonly _tag: 'Preset'; readonly id: ThemeId };

/** A Host theme wins only when the Host supplies one and Match VS Code theme is on; desktop never supplies one. */
export const selectEffectiveTheme = (input: {
  readonly hostTheme: HostTheme | undefined;
  readonly matchVscodeTheme: boolean;
  readonly themeId: ThemeId;
}): EffectiveTheme =>
  input.matchVscodeTheme && input.hostTheme !== undefined
    ? { _tag: 'Host', theme: input.hostTheme }
    : { _tag: 'Preset', id: input.themeId };

/** Keyed by the Host theme object so changing only the Theme preference never rebuilds the MUI theme. */
const hostMuiThemes = new WeakMap<HostTheme, Theme>();

export const muiThemeOf = (effective: EffectiveTheme): Theme => {
  if (effective._tag === 'Preset') {
    return themes[effective.id];
  }
  let muiTheme = hostMuiThemes.get(effective.theme);
  if (muiTheme === undefined) {
    muiTheme = createAppTheme(effective.theme.colors, effective.theme.font);
    hostMuiThemes.set(effective.theme, muiTheme);
  }
  return muiTheme;
};
