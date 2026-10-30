import type { Effect } from 'effect';
import { Context, Schema } from 'effect';

/** Host could not open a URL in the system default handler. */
export class OpenUrlFailed extends Schema.TaggedError<OpenUrlFailed>()('OpenUrlFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/**
 * Portable open-URL — system default browser / handler for http(s) auth and docs links.
 * React never imports host opener SDKs.
 */
export interface OpenUrl {
  readonly open: (url: string) => Effect.Effect<void, OpenUrlFailed>;
}

export const OpenUrl = Context.Service<OpenUrl>('OpenUrl');
