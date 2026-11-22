/** Build the site into dist/. `WEBSITE_BASE` (default `/`) is the path it is served under. */
import { execFileSync } from 'node:child_process';

execFileSync('vitepress', ['build', 'variants/c'], { cwd: new URL('..', import.meta.url), stdio: 'inherit' });
