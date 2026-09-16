import { Effect, Option, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { ensureHome, resolveHome } from './home.ts';
import { ProviderConfigCatalogDocumentJsonString } from './ProviderConfigCatalogDocument.ts';
import type { ProviderConfigCatalogDocument } from './ProviderConfigCatalogDocument.ts';

export const providerConfigCatalogPath = Effect.fn('providerConfigCatalogPath')(function* (launchTarget: string) {
  const path = yield* Path;
  const home = yield* resolveHome();
  return path.join(home, 'harness', launchTarget, 'provider-config-catalog.json');
});

export const readProviderConfigCatalog = Effect.fn('readProviderConfigCatalog')(function* (launchTarget: string) {
  const fs = yield* FileSystem;
  const filePath = yield* providerConfigCatalogPath(launchTarget);
  const present = yield* fs.exists(filePath);
  if (!present) {
    return Option.none<ProviderConfigCatalogDocument>();
  }

  const content = yield* fs.readFileString(filePath);
  return yield* Schema.decodeEffect(ProviderConfigCatalogDocumentJsonString)(content).pipe(
    Effect.map(Option.some),
    Effect.catchTag('SchemaError', () => Effect.succeed(Option.none())),
  );
});

export const writeProviderConfigCatalog = Effect.fn('writeProviderConfigCatalog')(function* (
  launchTarget: string,
  document: ProviderConfigCatalogDocument,
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  yield* ensureHome();
  const filePath = yield* providerConfigCatalogPath(launchTarget);
  yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
  const encoded = yield* Schema.encodeEffect(ProviderConfigCatalogDocumentJsonString)(document);
  const withNewline = encoded.endsWith('\n') ? encoded : `${encoded}\n`;
  yield* fs.writeFileString(filePath, withNewline);
});
