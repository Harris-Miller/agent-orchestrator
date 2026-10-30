import { OpenFile, OpenUrl } from '@lib/context-services';
import type { HostServices } from '@lib/context-services';
import { Effect, Option } from 'effect';
import { Path } from 'effect/Path';
import { defaultUrlTransform } from 'react-markdown';

export type ChatLink = { readonly kind: 'url'; readonly url: string } | { readonly kind: 'file'; readonly url: URL };

export const classifyChatLinkHref = (
  href: string,
  openFileSupported: boolean,
): ChatLink | { readonly kind: 'inert' } => {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: 'inert' };
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

export const chatLinkUrlTransform = (value: string, key: string) =>
  key === 'href' && value.startsWith('file:') ? value : defaultUrlTransform(value);

export const openChatLink = (link: ChatLink): Effect.Effect<void, never, HostServices> =>
  Effect.gen(function* () {
    if (link.kind === 'url') {
      const service = yield* OpenUrl;
      yield* service.open(link.url).pipe(Effect.tapError(error => Effect.logWarning('OpenUrl failed', error.message)));
      return;
    }
    const path = yield* Path;
    const absolute = yield* path.fromFileUrl(link.url).pipe(Effect.option);
    if (Option.isSome(absolute)) {
      const service = yield* OpenFile;
      yield* service
        .open(absolute.value)
        .pipe(Effect.tapError(error => Effect.logWarning('OpenFile failed', error.message)));
    }
  }).pipe(
    Effect.tapError(error => Effect.logWarning('Chat link open failed', error)),
    Effect.ignore,
  );
