import type { ToolKind } from '../../host/sessionUpdateReducer.ts';

export type TitleSegment = { readonly href?: string; readonly text: string };

const URL_SPLIT = /(https?:\/\/\S+)/;
const QUOTED_PATH = /^(.*?')([^']+)('.*)$/;
const VERB_PATH = /^(\S+\s+)(.+?)(\s+\([^)]*\))?$/;

const plain = (title: string): TitleSegment[] => [{ text: title }];

const urlSegments = (title: string): TitleSegment[] =>
  title
    .split(URL_SPLIT)
    .filter(part => part !== '')
    .map(part => (/^https?:\/\//.test(part) ? { href: part, text: part } : { text: part }));

const pathSegments = (title: string, path: string): TitleSegment[] => {
  const match = QUOTED_PATH.exec(title) ?? VERB_PATH.exec(title);
  if (match === null) return plain(title);
  const [, before, linked, after] = match;
  return [{ text: before }, { href: path, text: linked }, ...(after ? [{ text: after }] : [])];
};

/** Split a tool_call title into plain and linked parts: URLs for fetch/search, the file path for read. */
export const toolCallTitleSegments = (
  title: string,
  toolKind: ToolKind | undefined,
  locationPath: string | undefined,
): TitleSegment[] => {
  if (toolKind === 'fetch' || toolKind === 'search') return urlSegments(title);
  if (toolKind === 'read' && locationPath !== undefined) return pathSegments(title, locationPath);
  return plain(title);
};
