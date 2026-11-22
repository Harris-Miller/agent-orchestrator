import { defineConfig } from 'vitepress';
import { docsThemeConfig, sharedConfig } from '../../../shared/site.ts';

// PROTOTYPE (#435) — variant A
export default defineConfig({
  ...sharedConfig('a'),
  themeConfig: docsThemeConfig,
});
