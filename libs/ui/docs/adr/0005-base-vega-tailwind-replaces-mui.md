# base-vega, Base UI, and Tailwind replace MUI

The Harness UI is leaving MUI for shadcn **base-vega**: components copied into `@lib/ui`, headless behavior from Base UI (`@base-ui/react`), and layout from Tailwind CSS v4. Theme preference `original` stays the default id and uses base-vega's stock light `:root` palette; latte, frappe, macchiato, and mocha override those same semantic tokens. MUI still paints current screens until they move over.

## Considered options

- **Keep MUI and restyle the override table:** smaller cut, but that table is the chrome this migration is leaving.
- **Radix (`new-york-v4`):** the other shadcn primitive. Rejected so the shared UI has one headless library.
- **base-vega + Base UI + Tailwind (chosen):** the stack recorded on the migration epic.

## Consequences

- No separate light/dark control. The three dark Catppuccin preferences also set the `dark` class so copied components' `dark:` variants follow that palette.
- Preflight stays off so Allotment and the VS Code webview shell keep their box model.
