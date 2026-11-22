import { defineConfig } from 'vitepress';
import { docsThemeConfig, sharedConfig } from '../../../shared/site.ts';

// PROTOTYPE (#435) — variant C: variant A's navigation around a terminal-session landing page
export default defineConfig({
  ...sharedConfig('c'),
  themeConfig: docsThemeConfig,
});
