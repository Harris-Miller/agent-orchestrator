# @apps/website

[VitePress](https://vitepress.dev/) marketing + docs site for HOA (#435).

## Run

```sh
pnpm website                              # from the repo root: build + preview at http://localhost:4173/
pnpm --filter=@apps/website dev           # hot reload at :5183
```

## Layout

- `content/` — the Markdown (`index.md` is the landing page) plus `public/`.
- `.vitepress/` — VitePress config and theme (`ProductHome.vue` is the landing page).
- `shared/site.ts` — shared config (srcDir, base, nav/sidebar, search).
- `scripts/build.ts` — builds the site into `dist/`.

`WEBSITE_BASE` sets the path `dist/` is served under (`/<repo>/` on GitHub Pages).

`.github/workflows/website.yml` deploys to GitHub Pages on every push to `main` (each release).
