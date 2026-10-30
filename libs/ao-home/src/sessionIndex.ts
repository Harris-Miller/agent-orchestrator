import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { emptySessionIndex, SessionIndexDocumentJsonString } from './SessionIndexDocument.ts';
import type { SessionIndexDocument } from './SessionIndexDocument.ts';
import { ensureHome, resolveHome } from './home.ts';
import type { LaunchTarget } from './LaunchTarget.ts';

export const harnessDirPath = Effect.fn('harnessDirPath')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  const home = yield* resolveHome();
  return path.join(home, 'harness', launchTarget);
});

export const sessionIndexPath = Effect.fn('sessionIndexPath')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  return path.join(yield* harnessDirPath(launchTarget), 'session-index.json');
});

export const readSessionIndex = Effect.fn('readSessionIndex')(function* (launchTarget: LaunchTarget) {
  const fs = yield* FileSystem;
  const filePath = yield* sessionIndexPath(launchTarget);
  if (!(yield* fs.exists(filePath))) return emptySessionIndex;
  return yield* Schema.decodeEffect(SessionIndexDocumentJsonString)(yield* fs.readFileString(filePath)).pipe(
    Effect.catchTag('SchemaError', () => Effect.succeed(emptySessionIndex)),
  );
});

export const writeSessionIndex = Effect.fn('writeSessionIndex')(function* (
  launchTarget: LaunchTarget,
  document: SessionIndexDocument,
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  yield* ensureHome();
  const filePath = yield* sessionIndexPath(launchTarget);
  yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
  const encoded = yield* Schema.encodeEffect(SessionIndexDocumentJsonString)(document);
  yield* fs.writeFileString(filePath, encoded.endsWith('\n') ? encoded : `${encoded}\n`);
});
