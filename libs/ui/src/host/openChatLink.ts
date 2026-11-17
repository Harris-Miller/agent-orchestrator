import type { Base64Image } from '@lib/context-services';
import { OpenableImageMimeType, OpenFile, OpenUrl } from '@lib/context-services';
import { Effect, Option, Schema } from 'effect';
import { Path } from 'effect/Path';
import { defaultUrlTransform } from 'react-markdown';

import { parseDataUrlBase64 } from './imageDataUrl.ts';

export type ChatLink =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'file'; readonly url: URL }
  | { readonly kind: 'path'; readonly path: string; readonly cwd: string; readonly line?: number };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
export const WINDOWS_DRIVE = /^[a-z]:[\\/]/i;

/** Agents link workspace files as plain paths (`libs/x.ts#L3`, `/abs/dir`), not `file://` URIs. */
const classifyPathHref = (href: string, cwd: string): ChatLink | undefined => {
  if (href === '' || href.startsWith('#') || href.startsWith('//')) return undefined;
  if (SCHEME.test(href) && !WINDOWS_DRIVE.test(href)) return undefined;
  const raw = href.split(/[#?]/, 1)[0] ?? '';
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  return path === '' ? undefined : { cwd, kind: 'path', path };
};

/** `path:N`, `path:N-M` (first line wins) or `path:N:C` (column ignored); never `scheme://` hrefs. */
const LINE_SUFFIX = /^(?![a-z][a-z0-9+.-]*:\/\/)(.+?):(\d+)(?:[-–]\d+)?(?::\d+)?$/i;

/** `[./\\]` keeps scheme-like hrefs (`tel:123`) out; returns the path part and 1-based line when `href` is `path:N…`. */
const splitLineSuffix = (href: string): { readonly path: string; readonly line: number | undefined } | undefined => {
  const match = LINE_SUFFIX.exec(href);
  const path = match?.[1];
  const lineText = match?.[2];
  if (path === undefined || lineText === undefined || !/[./\\]/.test(path)) return undefined;
  const line = Number(lineText);
  // Absurd digit strings overflow to non-integers; open the file without a line instead.
  return { line: Number.isSafeInteger(line) ? Math.max(1, line) : undefined, path };
};

const parseUrl = (href: string): URL | undefined => {
  try {
    return new URL(href);
  } catch {
    return undefined;
  }
};

export const classifyChatLinkHref = (
  href: string,
  openFileSupported: boolean,
  cwd?: string,
): ChatLink | { readonly kind: 'inert' } => {
  // `a.ts:14` parses as a URL with protocol `a.ts:`, so line suffixes are tried first.
  const located = splitLineSuffix(href);
  if (located !== undefined) {
    const pathLink = openFileSupported && cwd !== undefined ? classifyPathHref(located.path, cwd) : undefined;
    if (pathLink?.kind === 'path') return located.line === undefined ? pathLink : { ...pathLink, line: located.line };
  }
  // `C:/x` parses as a URL with protocol `c:`, so drive paths take the path branch too.
  const url = WINDOWS_DRIVE.test(href) ? undefined : parseUrl(href);
  if (url === undefined) {
    const pathLink = openFileSupported && cwd !== undefined ? classifyPathHref(href, cwd) : undefined;
    return pathLink ?? { kind: 'inert' };
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') return { kind: 'url', url: url.href };
  if (
    url.protocol === 'file:' &&
    href.toLowerCase().startsWith('file://') &&
    openFileSupported &&
    (url.host === '' || url.host === 'localhost')
  ) {
    // `file://localhost/x` means `file:///x`; POSIX `fromFileUrl` rejects any host.
    const local = new URL(url);
    local.host = '';
    return { kind: 'file', url: local };
  }
  return { kind: 'inert' };
};

/** Openable image in a `data:<mime>;base64,…` URL (replayed thumbnails have no file uri), or `undefined`. */
export const base64ImageFromDataUrl = (dataUrl: string): Base64Image | undefined => {
  const parsed = parseDataUrlBase64(dataUrl);
  return parsed !== undefined && Schema.is(OpenableImageMimeType)(parsed.mimeType)
    ? { base64: parsed.data, mimeType: parsed.mimeType }
    : undefined;
};

/** Open an in-memory image via the Host's temp-file opener. */
export const openChatImageData: (image: Base64Image) => Effect.Effect<void, never, OpenFile> = Effect.fn(
  'openChatImageData',
)(
  function* (image: Base64Image) {
    const service = yield* OpenFile;
    yield* service
      .openImageData(image)
      .pipe(Effect.tapError(error => Effect.logWarning('OpenFile.openImageData failed', error.message)));
  },
  effect => Effect.ignore(effect),
);

// `a.ts:14` has a colon before any slash, so `defaultUrlTransform` would blank it as an unknown protocol.
export const chatLinkUrlTransform = (value: string, key: string) =>
  key === 'href' && (value.startsWith('file:') || splitLineSuffix(value) !== undefined)
    ? value
    : defaultUrlTransform(value);

export const openChatLink: (link: ChatLink) => Effect.Effect<void, never, OpenFile | OpenUrl | Path> = Effect.fn(
  'openChatLink',
)(
  function* (link: ChatLink) {
    if (link.kind === 'url') {
      const service = yield* OpenUrl;
      yield* service.open(link.url).pipe(Effect.tapError(error => Effect.logWarning('OpenUrl failed', error.message)));
      return;
    }
    const path = yield* Path;
    const absolute =
      link.kind === 'path'
        ? Option.some(path.resolve(link.cwd, link.path))
        : yield* path.fromFileUrl(link.url).pipe(Effect.option);
    if (Option.isSome(absolute)) {
      const service = yield* OpenFile;
      yield* service
        .open(absolute.value, link.kind === 'path' ? link.line : undefined)
        .pipe(Effect.tapError(error => Effect.logWarning('OpenFile failed', error.message)));
    }
  },
  effect => effect.pipe(Effect.tapError(error => Effect.logWarning('Chat link open failed', error))),
  effect => Effect.ignore(effect),
);
