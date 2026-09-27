import type { Effect } from 'effect';
import { Context, Schema } from 'effect';

/** Host could not resolve a packaged resource path to an absolute filesystem path. */
export class BundledResourceMissing extends Schema.TaggedError<BundledResourceMissing>()('BundledResourceMissing', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  resourcePath: Schema.String,
}) {}

/**
 * Resolve paths relative to the host’s packaged resource root to absolute FS paths
 * (Tauri: `resolveResource`; VS Code: `asAbsolutePath` / extension URI).
 */
export interface BundledResource {
  readonly resolve: (resourcePath: string) => Effect.Effect<string, BundledResourceMissing>;
}

export const BundledResource = Context.Service<BundledResource>('BundledResource');
