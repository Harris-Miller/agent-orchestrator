import { OS } from '@lib/context-services';
import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { defaultSettings, SettingsDocumentJsonString } from './SettingsDocument.ts';
import type { SettingsDocument } from './SettingsDocument.ts';

export const resolveHome = Effect.fn('resolveHome')(function* () {
  const os = yield* OS;
  const path = yield* Path;
  return path.join(os.homedir(), '.ao');
});

export const ensureHome = Effect.fn('ensureHome')(function* () {
  const fs = yield* FileSystem;
  const home = yield* resolveHome();
  yield* fs.makeDirectory(home, { recursive: true });
  return home;
});

export const settingsPath = Effect.fn('settingsPath')(function* () {
  const path = yield* Path;
  const home = yield* resolveHome();
  return path.join(home, 'settings.json');
});

export const readSettings = Effect.fn('readSettings')(function* () {
  const fs = yield* FileSystem;
  const filePath = yield* settingsPath();
  const present = yield* fs.exists(filePath);
  if (!present) {
    return defaultSettings;
  }

  const content = yield* fs.readFileString(filePath);
  return yield* Schema.decodeEffect(SettingsDocumentJsonString)(content).pipe(
    Effect.catchTag('SchemaError', () => Effect.succeed(defaultSettings)),
  );
});

export const writeSettings = Effect.fn('writeSettings')(function* (document: SettingsDocument) {
  const fs = yield* FileSystem;
  yield* ensureHome();
  const filePath = yield* settingsPath();
  const encoded = yield* Schema.encodeEffect(SettingsDocumentJsonString)(document);
  const withNewline = encoded.endsWith('\n') ? encoded : `${encoded}\n`;
  yield* fs.writeFileString(filePath, withNewline);
});
