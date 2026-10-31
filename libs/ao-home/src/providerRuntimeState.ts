import { AtomicFile } from '@lib/context-services';
import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';

import type { LaunchTarget } from './LaunchTarget.ts';
import { providerCurrentJsonPath } from './providers.ts';
import { ProviderRuntimeDocumentJsonString } from './ProviderRuntimeDocument.ts';
import type { ProviderRuntimeDocument } from './ProviderRuntimeDocument.ts';

/** `current.json` exists but is not a valid document. Never an instruction to seed, stop, or delete. */
export class ProviderRuntimeDocumentMalformed extends Schema.TaggedError<ProviderRuntimeDocumentMalformed>()(
  'ProviderRuntimeDocumentMalformed',
  { launchTarget: Schema.String, message: Schema.String },
) {}

export type ProviderRuntimeState =
  | { readonly _tag: 'Missing' }
  | { readonly _tag: 'Present'; readonly document: ProviderRuntimeDocument };

/**
 * Missing file → `Missing`. Malformed content → `ProviderRuntimeDocumentMalformed`.
 * Unreadable file → the underlying `PlatformError`. Call before every spawn; there is no file watching.
 */
export const readProviderRuntimeState = Effect.fn('readProviderRuntimeState')(function* (launchTarget: LaunchTarget) {
  const fs = yield* FileSystem;
  const filePath = yield* providerCurrentJsonPath(launchTarget);
  if (!(yield* fs.exists(filePath))) {
    return { _tag: 'Missing' } satisfies ProviderRuntimeState;
  }
  const content = yield* fs.readFileString(filePath);
  const document = yield* Schema.decodeEffect(ProviderRuntimeDocumentJsonString)(content).pipe(
    Effect.mapError(error => new ProviderRuntimeDocumentMalformed({ launchTarget, message: error.message })),
  );
  return { _tag: 'Present', document } satisfies ProviderRuntimeState;
});

/** Publish `current.json` through the Host's atomic replace. Validates the document before writing. */
export const writeProviderRuntimeDocument = Effect.fn('writeProviderRuntimeDocument')(function* (
  launchTarget: LaunchTarget,
  document: ProviderRuntimeDocument,
) {
  const atomicFile = yield* AtomicFile;
  const filePath = yield* providerCurrentJsonPath(launchTarget);
  const encoded = yield* Schema.encodeEffect(ProviderRuntimeDocumentJsonString)(document);
  yield* atomicFile.replaceFileString(filePath, encoded.endsWith('\n') ? encoded : `${encoded}\n`);
});
