import { Effect, Option, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import type { LaunchTarget } from './LaunchTarget.ts';
import { ensureHome } from './home.ts';
import { harnessDirPath } from './sessionIndex.ts';
import { ConfigOptionIndexDocumentJsonString } from './ConfigOptionIndexDocument.ts';
import type { ConfigOptionIndexDocument } from './ConfigOptionIndexDocument.ts';

export const configOptionIndexCachePath = Effect.fn('configOptionIndexCachePath')(function* (
  launchTarget: LaunchTarget,
) {
  const path = yield* Path;
  return path.join(yield* harnessDirPath(launchTarget), 'config-option-index.json');
});
export const readConfigOptionIndexCache = Effect.fn('readConfigOptionIndexCache')(function* (
  launchTarget: LaunchTarget,
) {
  const fs = yield* FileSystem;
  const filePath = yield* configOptionIndexCachePath(launchTarget);
  if (!(yield* fs.exists(filePath))) return Option.none<ConfigOptionIndexDocument>();
  return yield* Schema.decodeEffect(ConfigOptionIndexDocumentJsonString)(yield* fs.readFileString(filePath)).pipe(
    Effect.map(Option.some),
    Effect.catchTag('SchemaError', () => Effect.succeed(Option.none<ConfigOptionIndexDocument>())),
  );
});
export const writeConfigOptionIndexCache = Effect.fn('writeConfigOptionIndexCache')(function* (
  launchTarget: LaunchTarget,
  document: ConfigOptionIndexDocument,
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  yield* ensureHome();
  const filePath = yield* configOptionIndexCachePath(launchTarget);
  yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
  const encoded = yield* Schema.encodeEffect(ConfigOptionIndexDocumentJsonString)(document);
  yield* fs.writeFileString(filePath, encoded.endsWith('\n') ? encoded : `${encoded}\n`);
});
