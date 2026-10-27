/**
 * Resolve whitespace-committed `@path` tokens and FS markdown links against session cwd.
 * Non-image FS paths become `[@basename](file:///absolutePath)` (dirs with trailing `/`).
 * Image files are stripped from the draft; absolute paths returned for composer attachments.
 */
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { mimeTypeForImagePath } from '../../host/composerImageAttachment.ts';
import { findMarkdownLinks, isFileSystemHref } from '../../host/draftToContentBlocks.ts';
import { listingBasename } from '../../host/fdListing.ts';

import { isWhitespace } from './composerCommandTokens.ts';
import { fsMentionMarkdownLink } from './mentionMarkdown.ts';

export type ResolveComposerFsMentionsResult = {
  readonly draft: string;
  readonly imageAbsolutePaths: readonly string[];
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
  if (!isDir && mimeTypeForImagePath(absolute) !== undefined) {
    return { absolutePath: absolute, kind: 'image' as const };
  }
  const name = listingBasename(absolute);
  const hrefOut = isDir ? (absolute.endsWith('/') || absolute.endsWith('\\') ? absolute : `${absolute}/`) : absolute;
  return { kind: 'mention' as const, markdown: fsMentionMarkdownLink(name, hrefOut) };
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

/** Rewrite draft: non-image FS hits → chips; image hits → strip + collect absolute paths. */
export const resolveComposerFsMentions = Effect.fn('resolveComposerFsMentions')(function* (draft: string, cwd: string) {
  if (draft.length === 0 || cwd.length === 0) {
    return { draft, imageAbsolutePaths: [] } satisfies ResolveComposerFsMentionsResult;
  }

  const candidates = [
    ...collectAtPathCandidates(draft),
    ...findMarkdownLinks(draft)
      .filter(link => isFileSystemHref(link.href))
      .map(link => ({ end: link.end, href: link.href, start: link.start })),
  ];

  if (candidates.length === 0) {
    return { draft, imageAbsolutePaths: [] } satisfies ResolveComposerFsMentionsResult;
  }

  const resolved = yield* Effect.all(
    candidates.map(candidate =>
      resolvePathExists(cwd, candidate.href).pipe(
        Effect.map(result => {
          if (result === undefined) {
            return undefined;
          }
          if (result.kind === 'image') {
            return {
              absolutePath: result.absolutePath,
              end: candidate.end,
              replacement: '',
              start: candidate.start,
            };
          }
          return {
            absolutePath: undefined,
            end: candidate.end,
            replacement: result.markdown,
            start: candidate.start,
          };
        }),
      ),
    ),
    { concurrency: 'unbounded' },
  );

  const replacements = resolved
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .sort((a, b) => b.start - a.start);

  const imageAbsolutePaths: string[] = [];
  const seenImages = new Set<string>();
  let next = draft;
  for (const item of replacements) {
    const inBounds = item.end <= next.length && item.start <= item.end;
    const current = inBounds ? next.slice(item.start, item.end) : '';
    const shouldReplace =
      inBounds && current !== item.replacement && (current.startsWith('@') || current.startsWith('['));
    if (shouldReplace) {
      if (item.absolutePath !== undefined && !seenImages.has(item.absolutePath)) {
        seenImages.add(item.absolutePath);
        imageAbsolutePaths.unshift(item.absolutePath);
      }
      next = next.slice(0, item.start) + item.replacement + next.slice(item.end);
    }
  }

  return {
    draft: next.replace(/[^\S\n]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n'),
    imageAbsolutePaths,
  } satisfies ResolveComposerFsMentionsResult;
});
