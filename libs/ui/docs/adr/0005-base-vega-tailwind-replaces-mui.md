# base-vega, Base UI, and Tailwind replace MUI

The Harness UI is leaving MUI for shadcn **base-vega**: components copied into `@lib/ui`, headless behavior from Base UI (`@base-ui/react`), and layout from Tailwind CSS v4. Theme preference `original` stays the default id and uses the MUI Original palette (custom dark). Latte, Frappé, Macchiato, and Mocha override those same semantic tokens. Stock base-vega colors are not used. MUI still paints current screens until they move over.

## Considered options

- **Keep MUI and restyle the override table:** smaller cut, but that table is the chrome this migration is leaving.
- **Radix (`new-york-v4`):** the other shadcn primitive. Rejected so the shared UI has one headless library.
- **base-vega + Base UI + Tailwind (chosen):** the stack recorded on the migration epic.

## Consequences

- No separate light/dark control. `original` and the three dark Catppuccin preferences set the `dark` class so copied components' `dark:` variants follow that palette. `latte` stays light.
- Preflight stays off so Allotment and the VS Code webview shell keep their box model.
