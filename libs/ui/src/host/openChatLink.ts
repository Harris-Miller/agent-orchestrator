import { OpenFile, OpenUrl } from '@lib/context-services';
import type { HostServices } from '@lib/context-services';
import { Effect, Option } from 'effect';
import { Path } from 'effect/Path';
import { defaultUrlTransform } from 'react-markdown';

import { parseDataUrlBase64 } from './imageDataUrl.ts';

export type ChatLink =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'file'; readonly url: URL }
  | { readonly kind: 'path'; readonly path: string; readonly cwd: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_DRIVE = /^[a-z]:[\\/]/i;

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

export const classifyChatLinkHref = (
  href: string,
  openFileSupported: boolean,
  cwd?: string,
): ChatLink | { readonly kind: 'inert' } => {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    const pathLink = openFileSupported && cwd !== undefined ? classifyPathHref(href, cwd) : undefined;
    return pathLink ?? { kind: 'inert' };
  }
  if (WINDOWS_DRIVE.test(href)) {
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
    return { kind: 'file', url };
  }
  return { kind: 'inert' };
};

/** Open a data-URL image (replayed thumbnails have no file uri) via the Host's temp-file opener. */
export const openChatImageData: (dataUrl: string) => Effect.Effect<void, never, HostServices> = Effect.fn(
  'openChatImageData',
)(
  function* (dataUrl: string) {
    const parsed = parseDataUrlBase64(dataUrl);
    if (parsed === undefined) return;
    const service = yield* OpenFile;
    yield* service
      .openImageData(parsed.mimeType, parsed.data)
      .pipe(Effect.tapError(error => Effect.logWarning('OpenFile.openImageData failed', error.message)));
  },
  effect => Effect.ignore(effect),
);

export const chatLinkUrlTransform = (value: string, key: string) =>
  key === 'href' && value.startsWith('file:') ? value : defaultUrlTransform(value);

export const openChatLink: (link: ChatLink) => Effect.Effect<void, never, HostServices> = Effect.fn('openChatLink')(
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
        .open(absolute.value)
        .pipe(Effect.tapError(error => Effect.logWarning('OpenFile failed', error.message)));
    }
  },
  effect => effect.pipe(Effect.tapError(error => Effect.logWarning('Chat link open failed', error))),
  effect => Effect.ignore(effect),
);
