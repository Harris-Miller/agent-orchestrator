/**
 * PROTOTYPE (#435) — config shared by all three website variants.
 *
 * Every variant builds the same `content/` tree (srcDir) and swaps in its own home page
 * (`index-<key>.md` rewritten to `index.md`) and its own theme. Variants publish side by side:
 * `<WEBSITE_BASE><key>/`, so the switcher can hop between them keeping the current path.
 */
import { fileURLToPath } from 'node:url';
import type { DefaultTheme, UserConfig } from 'vitepress';
import { VARIANTS } from './variants.ts';
import type { VariantKey } from './variants.ts';

export const REPO_URL = 'https://github.com/Harris-Miller/agent-orchestrator';

const websiteDir = fileURLToPath(new URL('..', import.meta.url));
const contentDir = fileURLToPath(new URL('../content', import.meta.url));

/** `/` locally; `/<repo>/` on GitHub Pages. Always starts and ends with `/`. */
const websiteRoot = (): string => {
  const raw = process.env.WEBSITE_BASE ?? '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
};

export const nav: DefaultTheme.NavItem[] = [
  { text: 'Guide', link: '/guide/what-is-hoa', activeMatch: '/guide/' },
  { text: 'Contributing', link: '/contributing' },
];

export const sidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Introduction',
    items: [
      { text: 'What is HOA?', link: '/guide/what-is-hoa' },
      { text: 'Getting started', link: '/guide/getting-started' },
      { text: 'Agent providers', link: '/guide/providers' },
    ],
  },
  {
    text: 'Using HOA',
    items: [
      { text: 'Projects & Session History', link: '/guide/sessions' },
      { text: 'Working with an agent', link: '/guide/working-with-agents' },
      { text: 'Handoff & subagents', link: '/guide/handoff-and-subagents' },
      { text: 'Workstreams (experimental)', link: '/guide/workstreams' },
      { text: 'VS Code extension', link: '/guide/vscode' },
    ],
  },
  { text: 'Contributing', items: [{ text: 'Develop HOA', link: '/contributing' }] },
];

/** Variant A's docs navigation (also used by C): top nav, one global sidebar, local search. */
export const docsThemeConfig: DefaultTheme.Config = {
  logo: '/logo.svg',
  nav,
  sidebar,
  socialLinks: [{ icon: 'github', link: REPO_URL }],
  search: { provider: 'local' },
  editLink: { pattern: `${REPO_URL}/edit/main/apps/website/content/:path`, text: 'Edit this page on GitHub' },
  outline: [2, 3],
  footer: { message: 'Pre-alpha software. Built with VitePress.' },
};

export const sharedConfig = (key: VariantKey): UserConfig<DefaultTheme.Config> => {
  const root = websiteRoot();
  const others = VARIANTS.filter(v => v.key !== key).map(v => `index-${v.key}.md`);
  return {
    title: 'HOA',
    titleTemplate: ':title · Harness Orchestrating Agents',
    description:
      'A desktop home for your coding agents — Codex, Claude, Cursor and more, over the Agent Client Protocol.',
    lang: 'en-US',
    base: `${root}${key}/`,
    srcDir: contentDir,
    srcExclude: [...others, '**/README.md'],
    rewrites: { [`index-${key}.md`]: 'index.md' },
    outDir: fileURLToPath(new URL(`../dist/${key}`, import.meta.url)),
    cleanUrls: true,
    head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${root}${key}/logo.svg` }]],
    markdown: { theme: { light: 'github-light', dark: 'github-dark' } },
    vite: {
      define: {
        __PROTOTYPE_SWITCHER__: JSON.stringify(process.env.WEBSITE_PROTOTYPE === '1'),
        __WEBSITE_ROOT__: JSON.stringify(root),
      },
      server: { fs: { allow: [websiteDir] } },
    },
  };
};
