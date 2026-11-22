# @apps/website — PROTOTYPE (#435)

Originally three; only variant C remains (A and B were removed). The remaining [VitePress](https://vitepress.dev/) variant of the HOA marketing + docs site, built from one shared `content/` tree so they can be compared page-for-page.

| Key | Variant           | Shape                                                                                                                       |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `c` | A nav + B landing | Variant A's navigation (default theme, one sidebar, local search, light/dark toggle) with variant B's product landing page. |

## Run

```sh
pnpm website            # from the repo root: build + preview at http://localhost:4173/
```

Edit with hot reload: `pnpm --filter=@apps/website dev:c` (`:5183`).

## Layout

- `content/` — the Markdown every variant renders (`index-<key>.md` is each variant's home, rewritten to `/`), plus `public/`.
- `shared/site.ts` — config every variant spreads (srcDir, rewrites, base, sidebar); `shared/PrototypeSwitcher.vue` — the switcher.
- `variants/<key>/.vitepress/` — each variant's config and theme.
- `scripts/build.ts` — builds the site into `dist/`.

`WEBSITE_BASE` sets the path the whole `dist/` is served under (`/<repo>/` on GitHub Pages); `WEBSITE_PROTOTYPE=1` shows the switcher.

`.github/workflows/website.yml` is the Pages deploy for **after** a winner lands on `main`: GitHub only dispatches workflows that exist on the default branch, and the `github-pages` environment deploys from it. Until then, review the variants locally with `pnpm website`.
