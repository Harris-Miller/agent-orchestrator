import { defineConfig } from 'vitepress';
import { REPO_URL, sharedConfig, sidebar } from '../../../shared/site.ts';

const [intro, using, contributing] = sidebar;
const items = (group: (typeof sidebar)[number] | undefined) =>
  (group?.items ?? []).map(i => ({ text: i.text ?? '', link: i.link ?? '/' }));

// PROTOTYPE (#435) variant B — "Product story": product nav with dropdowns; a sidebar per docs section.
export default defineConfig({
  ...sharedConfig('b'),
  appearance: 'dark',
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'HOA',
    nav: [
      {
        text: 'Product',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'What is HOA?', link: '/guide/what-is-hoa' },
          { text: 'Agent providers', link: '/guide/providers' },
          { text: 'VS Code extension', link: '/guide/vscode' },
        ],
      },
      {
        text: 'Docs',
        activeMatch: '/guide/',
        items: [
          { text: 'Introduction', items: items(intro) },
          { text: 'Using HOA', items: items(using) },
        ],
      },
      { text: 'Contribute', link: '/contributing' },
      { text: 'Get started', link: '/guide/getting-started' },
    ],
    sidebar: {
      '/guide/': [intro, using].filter(g => g !== undefined),
      '/contributing': [contributing].filter(g => g !== undefined),
    },
    socialLinks: [{ icon: 'github', link: REPO_URL }],
    search: { provider: 'local', options: { detailedView: true } },
    outline: { level: [2, 3], label: 'On this page' },
    docFooter: { prev: 'Previous', next: 'Next' },
  },
});
