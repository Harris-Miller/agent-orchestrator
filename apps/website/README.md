# @apps/website — PROTOTYPE (#435)

Three complete [VitePress](https://vitepress.dev/) variants of the HOA marketing + docs site, built from one shared `content/` tree so they can be compared page-for-page.

| Key | Variant           | Shape                                                                                                                                                                   |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a` | Docs-first        | Stock default theme: `layout: home` hero + feature grid, one global sidebar, local search.                                                                              |
| `b` | Product story     | Default theme for docs, but a custom long-scroll landing (animated app mock, how-it-works, feature rows), dropdown product nav, a sidebar per docs section, dark-first. |
| `c` | A nav + B landing | Variant A's navigation (default theme, one sidebar, local search, light/dark toggle) with variant B's product landing page.                                             |

## Run

```sh
pnpm website            # from the repo root: build all three + preview at http://localhost:4173/
```

Flip variants with the pink switcher at the bottom (or ← / →); it keeps the current page.

Edit one variant with hot reload: `pnpm --filter=@apps/website dev:a` (`:5181`), `dev:b` (`:5182`), `dev:c` (`:5183`). Run all three to use the switcher in dev.

## Layout

- `content/` — the Markdown every variant renders (`index-<key>.md` is each variant's home, rewritten to `/`), plus `public/`.
- `shared/site.ts` — config every variant spreads (srcDir, rewrites, base, sidebar); `shared/PrototypeSwitcher.vue` — the switcher.
- `variants/<key>/.vitepress/` — each variant's config and theme.
- `scripts/build.ts` — builds every variant into `dist/<key>/` and writes `dist/index.html`.

`WEBSITE_BASE` sets the path the whole `dist/` is served under (`/<repo>/` on GitHub Pages); `WEBSITE_PROTOTYPE=1` shows the switcher.

`.github/workflows/website.yml` is the Pages deploy for **after** a winner lands on `main`: GitHub only dispatches workflows that exist on the default branch, and the `github-pages` environment deploys from it. Until then, review the variants locally with `pnpm website`.
