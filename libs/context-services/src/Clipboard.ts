import type { Effect } from 'effect';
import { Context, Schema } from 'effect';

/** Host could not write plain text to the system clipboard. */
export class ClipboardWriteFailed extends Schema.TaggedError<ClipboardWriteFailed>()('ClipboardWriteFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/** Host could not read plain text from the system clipboard. */
export class ClipboardReadFailed extends Schema.TaggedError<ClipboardReadFailed>()('ClipboardReadFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/**
 * Portable clipboard — web Async Clipboard ∩ Tauri clipboard-manager text only
 * (`writeText` / `readText`). No label, clear, image, or html.
 */
export interface Clipboard {
  readonly readText: () => Effect.Effect<string, ClipboardReadFailed>;
  readonly writeText: (text: string) => Effect.Effect<void, ClipboardWriteFailed>;
}

export const Clipboard = Context.Service<Clipboard>('Clipboard');
