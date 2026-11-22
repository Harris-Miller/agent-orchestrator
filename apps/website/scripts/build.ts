/**
 * PROTOTYPE (#435) — build every variant into dist/<key>/ and write dist/index.html, which
 * lists them. `WEBSITE_BASE` (default `/`) is the path the whole dist/ is served under.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { VARIANTS } from '../shared/variants.ts';

const websiteDir = new URL('..', import.meta.url);

for (const { key } of VARIANTS) {
  execFileSync('vitepress', ['build', `variants/${key}`], { cwd: websiteDir, stdio: 'inherit' });
}

const links = VARIANTS.map(v => `<li><a href="./${v.key}/">${v.key.toUpperCase()} — ${v.name}</a></li>`).join(
  '\n      ',
);
writeFileSync(
  new URL('../dist/index.html', import.meta.url),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HOA website prototypes (#435)</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; background: #121214; color: #e6e6e6; }
      a { color: #1fc8b8; }
    </style>
  </head>
  <body>
    <h1>HOA website — prototype variants</h1>
    <p>Issue #435. Each variant is a complete VitePress site over the same content; use the pink switcher (or ← / →) to compare the same page across variants.</p>
    <ul>
      ${links}
    </ul>
  </body>
</html>
`,
);
