/**
 * Resolve whitespace-committed `@path` tokens and FS markdown links against session cwd.
 * Successful FS paths become `[@basename](file:///absolutePath)` (dirs with trailing `/`).
 */
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { findMarkdownLinks } from '../../host/draftToContentBlocks.ts';
import { listingBasename } from '../../host/fdListing.ts';

import { isWhitespace } from './composerCommandTokens.ts';
import { fsMentionMarkdownLink } from './mentionMarkdown.ts';

const WINDOWS_ABS_RE = /^[A-Za-z]:[\\/]/;
const URI_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

const isFsCandidateHref = (href: string): boolean => {
  if (href.startsWith('file://')) {
    return true;
  }
  if (href.startsWith('/') || WINDOWS_ABS_RE.test(href)) {
    return true;
  }
  if (URI_SCHEME_RE.test(href)) {
    return false;
  }
  return href.length > 0;
};

type Replacement = {
  readonly end: number;
  readonly replacement: string;
  readonly start: number;
};

const resolvePathExists = Effect.fn('resolvePathExists')(function* (cwd: string, rawHref: string) {
  const pathApi = yield* Path;
  const fs = yield* FileSystem;
  let href = rawHref;
  if (rawHref.startsWith('file://')) {
    const fromUrl = yield* pathApi.fromFileUrl(new URL(rawHref)).pipe(Effect.option);
    if (fromUrl._tag === 'None') {
      return undefined;
    }
    href = fromUrl.value;
  }
  const absolute = pathApi.isAbsolute(href) ? pathApi.normalize(href) : pathApi.resolve(cwd, href);
  const trailingSlash = href.endsWith('/') || href.endsWith('\\');
  const exists = yield* fs.exists(absolute).pipe(Effect.orElseSucceed(() => false));
  if (!exists) {
    return undefined;
  }
  let isDir = trailingSlash;
  if (!trailingSlash) {
    const info = yield* fs.stat(absolute).pipe(Effect.option);
    if (info._tag === 'None') {
      return undefined;
    }
    isDir = info.value.type === 'Directory';
  }
  const name = listingBasename(absolute);
  const hrefOut = isDir ? (absolute.endsWith('/') || absolute.endsWith('\\') ? absolute : `${absolute}/`) : absolute;
  return fsMentionMarkdownLink(name, hrefOut);
});

const collectAtPathCandidates = (
  draft: string,
): readonly { readonly end: number; readonly href: string; readonly start: number }[] => {
  const candidates: { readonly end: number; readonly href: string; readonly start: number }[] = [];
  let index = 0;
  while (index < draft.length) {
    if (isWhitespace(draft[index])) {
      index += 1;
    } else {
      const tokenStart = index;
      while (index < draft.length && !isWhitespace(draft[index])) {
        index += 1;
      }
      const token = draft.slice(tokenStart, index);
      const whitespaceCommitted = index < draft.length;
      if (whitespaceCommitted && token.startsWith('@') && token.length > 1) {
        candidates.push({ end: index, href: token.slice(1), start: tokenStart });
      }
    }
  }
  return candidates;
};

/** Rewrite draft so FS-valid `@path` / markdown links become `[@basename](file://…)` chips. */
export const resolveComposerFsMentions = Effect.fn('resolveComposerFsMentions')(function* (draft: string, cwd: string) {
  if (draft.length === 0 || cwd.length === 0) {
    return draft;
  }

  const candidates = [
    ...collectAtPathCandidates(draft),
    ...findMarkdownLinks(draft)
      .filter(link => isFsCandidateHref(link.href))
      .map(link => ({ end: link.end, href: link.href, start: link.start })),
  ];

  if (candidates.length === 0) {
    return draft;
  }

  const resolved = yield* Effect.all(
    candidates.map(candidate =>
      resolvePathExists(cwd, candidate.href).pipe(
        Effect.map(replacement =>
          replacement === undefined
            ? undefined
            : ({ end: candidate.end, replacement, start: candidate.start } satisfies Replacement),
        ),
      ),
    ),
    { concurrency: 'unbounded' },
  );

  const replacements = resolved
    .filter((item): item is Replacement => item !== undefined)
    .sort((a, b) => b.start - a.start);

  let next = draft;
  for (const item of replacements) {
    const inBounds = item.end <= next.length && item.start <= item.end;
    const current = inBounds ? next.slice(item.start, item.end) : '';
    const shouldReplace =
      inBounds && current !== item.replacement && (current.startsWith('@') || current.startsWith('['));
    if (shouldReplace) {
      next = next.slice(0, item.start) + item.replacement + next.slice(item.end);
    }
  }
  return next;
});
