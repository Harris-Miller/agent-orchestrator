# The light palette holds only light themes, the dark palette only dark themes

Issue #160 splits the single Theme preference into a Light palette and a Dark palette, with a Painted slot setting choosing which one shows. Whether a theme is light or dark is a property of the theme itself (its `ThemeColors.mode` drives shadows, contrast and MUI's palette mode), so each slot only accepts themes of its own mode and its picker lists only those. A stored id that does not fit its slot falls back to that slot's default.

## Considered options

- **Any theme in either slot:** rejected because the painted slot and the theme's own mode could then disagree (a dark theme under the light slot), which would mean overriding MUI's palette mode per slot and re-deriving every mode-dependent color. It buys little: with several light and dark themes shipped, nobody needs Mocha as their "light" theme.
- **Keep one Theme preference and add only an OS-follow switch:** rejected because it cannot express "Latte by day, Mocha by night".

A saved single `theme` string still loads: it fills the slot matching its mode and sets the Painted slot setting to that side, so the look is unchanged.
