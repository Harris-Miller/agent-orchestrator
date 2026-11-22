import { defineConfig } from 'vitepress';
import { docsThemeConfig, sharedConfig } from '../../../shared/site.ts';

// PROTOTYPE (#435) — variant C: variant A's navigation with variant B's landing page
export default defineConfig({
  ...sharedConfig('c'),
  themeConfig: docsThemeConfig,
});
