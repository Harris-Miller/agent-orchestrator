import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { AdapterHistoryDocumentJsonString, emptyAdapterHistory } from './AdapterHistoryDocument.ts';
import type { AdapterHistoryDocument } from './AdapterHistoryDocument.ts';
import { ensureHome, resolveHome } from './home.ts';
import type { LaunchTarget } from './LaunchTarget.ts';

export const adapterDirPath = Effect.fn('adapterDirPath')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  const home = yield* resolveHome();
  return path.join(home, 'adapters', launchTarget);
});

export const adapterHistoryPath = Effect.fn('adapterHistoryPath')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  const dir = yield* adapterDirPath(launchTarget);
  return path.join(dir, 'history.json');
});

export const adapterHistoryLockPath = Effect.fn('adapterHistoryLockPath')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  const dir = yield* adapterDirPath(launchTarget);
  return path.join(dir, 'history.lock');
});

export const readAdapterHistory = Effect.fn('readAdapterHistory')(function* (launchTarget: LaunchTarget) {
  const fs = yield* FileSystem;
  const filePath = yield* adapterHistoryPath(launchTarget);
  const present = yield* fs.exists(filePath);
  if (!present) {
    return emptyAdapterHistory;
  }

  const content = yield* fs.readFileString(filePath);
  return yield* Schema.decodeEffect(AdapterHistoryDocumentJsonString)(content).pipe(
    Effect.catchTag('SchemaError', () => Effect.succeed(emptyAdapterHistory)),
  );
});

export const writeAdapterHistory = Effect.fn('writeAdapterHistory')(function* (
  launchTarget: LaunchTarget,
  document: AdapterHistoryDocument,
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  yield* ensureHome();
  const filePath = yield* adapterHistoryPath(launchTarget);
  yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
  const encoded = yield* Schema.encodeEffect(AdapterHistoryDocumentJsonString)(document);
  const withNewline = encoded.endsWith('\n') ? encoded : `${encoded}\n`;
  yield* fs.writeFileString(filePath, withNewline);
});

/**
 * Run `effect` while holding `adapters/<launchTarget>/history.lock` (`open` + `"wx"`).
 * RMW of the history should run inside this helper; bare read/write stay for tests and full replace.
 */
export const withAdapterHistoryLock = Effect.fn('withAdapterHistoryLock')(function* <A, E, R>(
  launchTarget: LaunchTarget,
  effect: Effect.Effect<A, E, R>,
) {
  const fs = yield* FileSystem;
  yield* ensureHome();
  const dir = yield* adapterDirPath(launchTarget);
  yield* fs.makeDirectory(dir, { recursive: true });
  const lockPath = yield* adapterHistoryLockPath(launchTarget);

  return yield* Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.gen(function* () {
        for (;;) {
          const acquired = yield* fs.open(lockPath, { flag: 'wx' }).pipe(
            Effect.as(true),
            Effect.catchTag('PlatformError', error =>
              error.reason._tag === 'AlreadyExists' ? Effect.succeed(false) : Effect.fail(error),
            ),
          );
          if (acquired) {
            return;
          }
          yield* Effect.sleep('10 millis');
        }
      });

      yield* Effect.addFinalizer(() => fs.remove(lockPath, { force: true }).pipe(Effect.ignore));

      return yield* effect;
    }),
  );
});
