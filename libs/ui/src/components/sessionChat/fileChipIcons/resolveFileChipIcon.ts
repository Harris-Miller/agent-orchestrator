import Link from '@mui/icons-material/Link';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { ComponentType } from 'react';

import type { ThemeId } from '../../../theme/themeId.ts';

import type { FileIconPackId } from './packId.ts';
import { getPackSvg, svgToDataUrl } from './packs.ts';

export type FileChipIcon =
  { readonly Icon: ComponentType<SvgIconProps>; readonly kind: 'mui' } | { readonly kind: 'svg'; readonly url: string };

const EXT_TO_KEY: Readonly<Record<string, string>> = {
  bash: 'sh',
  cjs: 'js',
  css: 'css',
  env: 'env',
  go: 'go',
  htm: 'html',
  html: 'html',
  js: 'js',
  json: 'json',
  jsx: 'jsx',
  lock: 'lock',
  md: 'md',
  mdx: 'md',
  mjs: 'js',
  py: 'py',
  rs: 'rs',
  scss: 'css',
  sh: 'sh',
  svg: 'svg',
  toml: 'toml',
  ts: 'ts',
  tsx: 'tsx',
  txt: 'txt',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'sh',
};

export const packIdForTheme = (themeId: ThemeId): FileIconPackId => {
  if (themeId === 'original') {
    return 'original';
  }
  if (themeId === 'latte') {
    return 'catppuccin-latte';
  }
  return 'catppuccin-mocha';
};

/** Path-like / `file:` → file map; bare URLs with a scheme → Link. */
export const isPathLikeHref = (href: string): boolean => {
  if (href.startsWith('file:')) {
    return true;
  }
  if (href.startsWith('./') || href.startsWith('../') || href.startsWith('/')) {
    return true;
  }
  if (/^[A-Za-z]:[\\/]/u.test(href)) {
    return true;
  }
  // No URI scheme → treat as relative path (e.g. `README.md`).
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(href);
};

export const basenameFromHref = (href: string): string | undefined => {
  if (href.startsWith('file:')) {
    try {
      const { pathname } = new URL(href);
      const trimmed = pathname.replace(/\/+$/u, '');
      const last = trimmed.split('/').pop();
      return last !== undefined && last.length > 0 ? decodeURIComponent(last) : undefined;
    } catch {
      // fall through to slash split
    }
  }
  const trimmed = href.replace(/[\\/]+$/u, '');
  const last = trimmed.split(/[\\/]/u).pop();
  return last !== undefined && last.length > 0 ? last : undefined;
};

/** Strip leading `@` for lookup only — display label stays unchanged at the call site. */
export const basenameForLookup = (label: string): string => (label.startsWith('@') ? label.slice(1) : label);

export const logicalKeyForBasename = (basename: string): string => {
  const lower = basename.toLowerCase();
  if (lower === 'package.json') {
    return 'package.json';
  }
  if (lower === 'pnpm-lock.yaml' || lower.endsWith('/pnpm-lock.yaml')) {
    return 'pnpm';
  }
  if (lower === 'yarn.lock' || lower === 'package-lock.json' || lower === 'bun.lock' || lower === 'bun.lockb') {
    return 'lock';
  }
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) {
    return 'docker';
  }
  if (lower === '.gitignore' || lower === '.gitattributes' || lower === '.gitmodules') {
    return 'git';
  }
  if (lower === '.env' || lower.startsWith('.env.')) {
    return 'env';
  }
  if (lower.includes('vite.config')) {
    return 'vite';
  }
  const dot = lower.lastIndexOf('.');
  if (dot <= 0 || dot === lower.length - 1) {
    return 'default-file';
  }
  return EXT_TO_KEY[lower.slice(dot + 1)] ?? 'default-file';
};

const svgIcon = (key: string, themeId: ThemeId): FileChipIcon => {
  const packId = packIdForTheme(themeId);
  const svg = getPackSvg(packId, key) ?? getPackSvg(packId, 'default-file');
  if (svg === undefined) {
    // Packs always ship default-file; keep a Link fallback if assets fail to load in tests.
    return { Icon: Link, kind: 'mui' };
  }
  return { kind: 'svg', url: svgToDataUrl(svg) };
};

export const resolveFileChipIcon = (
  input: { readonly href?: string; readonly label: string },
  themeId: ThemeId,
): FileChipIcon => {
  const href = input.href ?? '';
  if (href.length === 0) {
    return svgIcon(logicalKeyForBasename(basenameForLookup(input.label)), themeId);
  }
  if (href.endsWith('/') || href.endsWith('\\')) {
    return svgIcon('default-folder', themeId);
  }
  if (!isPathLikeHref(href)) {
    return { Icon: Link, kind: 'mui' };
  }
  const fromHref = basenameFromHref(href);
  const basename = fromHref !== undefined && fromHref.length > 0 ? fromHref : basenameForLookup(input.label);
  return svgIcon(logicalKeyForBasename(basename), themeId);
};
