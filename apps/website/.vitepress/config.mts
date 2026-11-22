import { defineConfig } from 'vitepress';
import { docsThemeConfig, siteConfig } from '../shared/site.ts';

export default defineConfig({
  ...siteConfig(),
  themeConfig: docsThemeConfig,
});
