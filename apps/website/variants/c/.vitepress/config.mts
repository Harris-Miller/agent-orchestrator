import { defineConfig } from 'vitepress';
import { REPO_URL, sharedConfig, sidebar } from '../../../shared/site.ts';

// PROTOTYPE (#435) variant C — "Terminal manual": a fully custom theme (no default theme).
export default defineConfig({
  ...sharedConfig('c'),
  themeConfig: { sidebar, socialLinks: [{ icon: 'github', link: REPO_URL }] },
});
