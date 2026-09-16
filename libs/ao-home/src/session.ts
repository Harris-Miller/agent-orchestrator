import { Effect, Option, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { ensureHome, resolveHome } from './home.ts';
import { SessionUsageDocumentJsonString } from './SessionUsageDocument.ts';
import type { SessionUsageDocument } from './SessionUsageDocument.ts';

export const sessionDirPath = Effect.fn('sessionDirPath')(function* (sessionId: string) {
  const path = yield* Path;
  const home = yield* resolveHome();
  return path.join(home, 'sessions', sessionId);
});

export const sessionUsagePath = Effect.fn('sessionUsagePath')(function* (sessionId: string) {
  const path = yield* Path;
  const dir = yield* sessionDirPath(sessionId);
  return path.join(dir, 'usage.json');
});

export const readSessionUsage = Effect.fn('readSessionUsage')(function* (sessionId: string) {
  const fs = yield* FileSystem;
  const filePath = yield* sessionUsagePath(sessionId);
  const present = yield* fs.exists(filePath);
  if (!present) {
    return Option.none<SessionUsageDocument>();
  }

  const content = yield* fs.readFileString(filePath);
  return yield* Schema.decodeEffect(SessionUsageDocumentJsonString)(content).pipe(
    Effect.map(Option.some),
    Effect.catchTag('SchemaError', () => Effect.succeed(Option.none())),
  );
});

export const writeSessionUsage = Effect.fn('writeSessionUsage')(function* (
  sessionId: string,
  document: SessionUsageDocument,
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  yield* ensureHome();
  const filePath = yield* sessionUsagePath(sessionId);
  yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
  const encoded = yield* Schema.encodeEffect(SessionUsageDocumentJsonString)(document);
  const withNewline = encoded.endsWith('\n') ? encoded : `${encoded}\n`;
  yield* fs.writeFileString(filePath, withNewline);
});

/** Remove `sessions/<id>/` recursively. Missing path is a no-op. */
export const deleteSessionDir = Effect.fn('deleteSessionDir')(function* (sessionId: string) {
  const fs = yield* FileSystem;
  const dirPath = yield* sessionDirPath(sessionId);
  yield* fs.remove(dirPath, { force: true, recursive: true });
});
