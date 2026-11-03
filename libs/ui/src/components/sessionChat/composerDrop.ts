/** Pure helpers for dropping OS files / editor resources onto the session composer. */
import { Predicate } from 'effect';

import { absolutePathToFileUrlHref } from './mentionMarkdown.ts';

const fileUriToPath = (uri: string): string | undefined => {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'file:') {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }
  // `file:///c%3A/Users` → `/c:/Users` → `c:/Users`
  return /^\/[A-Za-z]:/.test(decoded) ? decoded.slice(1) : decoded;
};

const parseUriList = (uriList: string): string[] =>
  uriList
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

const parseJsonStringArray = (raw: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Predicate.isString) : [];
  } catch {
    return [];
  }
};

/** DataTransfer types that carry file or editor resources from a VS Code drag. */
export const composerDropTypes: readonly string[] = ['text/uri-list', 'resourceurls'];

/** Absolute `file:` paths from a DataTransfer (`text/uri-list`, VS Code `resourceurls`). Read synchronously in the drop handler. */
export const pathsFromDataTransfer = (getData: (type: string) => string): string[] => {
  const uris = [...parseUriList(getData('text/uri-list')), ...parseJsonStringArray(getData('resourceurls'))];
  return uris.flatMap(uri => {
    const path = fileUriToPath(uri);
    return path === undefined ? [] : [path];
  });
};

export type DroppedPathEntry = { readonly kind: 'dir' | 'file'; readonly path: string };

const basenameOf = (path: string): string => {
  const trimmed = path.replace(/[\\/]+$/, '');
  return trimmed.split(/[\\/]/).pop() ?? '';
};

/** `[@name](file:///abs)` links for each dropped path, joined by single spaces. Directories keep a trailing `/`. */
export const dropMentionsMarkdown = (entries: readonly DroppedPathEntry[]): string =>
  entries
    .map(({ kind, path }) => {
      const name = basenameOf(path) || path;
      const trailing = kind === 'dir' && !path.endsWith('/') ? '/' : '';
      const href = absolutePathToFileUrlHref(`${path}${trailing}`);
      return `[@${name}](${href})`;
    })
    .join(' ');

/** Splice mention markdown at the cursor (or the end), padded with a trailing space; returns the caret after it. */
export const insertDroppedMentions = (
  draft: string,
  cursor: null | number,
  markdown: string,
): { readonly cursor: number; readonly draft: string } => {
  const at = cursor ?? draft.length;
  const before = draft.slice(0, at);
  const after = draft.slice(at);
  const lead = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const inserted = `${lead}${markdown} `;
  const nextDraft = before + inserted + after;
  return { cursor: before.length + inserted.length, draft: nextDraft };
};
