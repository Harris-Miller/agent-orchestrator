import { defineConfig } from 'vitepress';
import { nav, REPO_URL, sharedConfig, sidebar } from '../../../shared/site.ts';

// PROTOTYPE (#435) — variant A
export default defineConfig({
  ...sharedConfig('a'),
  themeConfig: {
    logo: '/logo.svg',
    nav,
    sidebar,
    socialLinks: [{ icon: 'github', link: REPO_URL }],
    search: { provider: 'local' },
    editLink: { pattern: `${REPO_URL}/edit/main/apps/website/content/:path`, text: 'Edit this page on GitHub' },
    outline: [2, 3],
    footer: { message: 'Pre-alpha software. Built with VitePress.' },
  },
});
