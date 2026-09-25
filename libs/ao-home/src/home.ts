import { OS } from '@lib/context-services';
import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { defaultSettings, UserSettingsJsonString } from './UserSettings.ts';
import type { UserSettings } from './UserSettings.ts';

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

export const readUserSettings = Effect.fn('readUserSettings')(function* () {
  const fs = yield* FileSystem;
  const filePath = yield* settingsPath();
  const present = yield* fs.exists(filePath);
  if (!present) {
    return defaultSettings;
  }

  const content = yield* fs.readFileString(filePath);
  return yield* Schema.decodeEffect(UserSettingsJsonString)(content).pipe(
    Effect.catchTag('SchemaError', () => Effect.succeed(defaultSettings)),
  );
});

export const writeUserSettings = Effect.fn('writeUserSettings')(function* (userSettings: UserSettings) {
  const fs = yield* FileSystem;
  yield* ensureHome();
  const filePath = yield* settingsPath();
  const encoded = yield* Schema.encodeEffect(UserSettingsJsonString)(userSettings);
  const withNewline = encoded.endsWith('\n') ? encoded : `${encoded}\n`;
  yield* fs.writeFileString(filePath, withNewline);
});
