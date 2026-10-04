import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { AdapterRosterDocumentJsonString, emptyAdapterRoster } from './AdapterRosterDocument.ts';
import type { AdapterRosterDocument } from './AdapterRosterDocument.ts';
import { ensureHome, resolveHome } from './home.ts';
import type { LaunchTarget } from './LaunchTarget.ts';

export const adapterDirPath = Effect.fn('adapterDirPath')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  const home = yield* resolveHome();
  return path.join(home, 'adapters', launchTarget);
});

export const adapterRosterPath = Effect.fn('adapterRosterPath')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  const dir = yield* adapterDirPath(launchTarget);
  return path.join(dir, 'roster.json');
});

export const adapterRosterLockPath = Effect.fn('adapterRosterLockPath')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  const dir = yield* adapterDirPath(launchTarget);
  return path.join(dir, 'roster.lock');
});

export const readAdapterRoster = Effect.fn('readAdapterRoster')(function* (launchTarget: LaunchTarget) {
  const fs = yield* FileSystem;
  const filePath = yield* adapterRosterPath(launchTarget);
  const present = yield* fs.exists(filePath);
  if (!present) {
    return emptyAdapterRoster;
  }

  const content = yield* fs.readFileString(filePath);
  return yield* Schema.decodeEffect(AdapterRosterDocumentJsonString)(content).pipe(
    Effect.catchTag('SchemaError', () => Effect.succeed(emptyAdapterRoster)),
  );
});

export const writeAdapterRoster = Effect.fn('writeAdapterRoster')(function* (
  launchTarget: LaunchTarget,
  document: AdapterRosterDocument,
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  yield* ensureHome();
  const filePath = yield* adapterRosterPath(launchTarget);
  yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
  const encoded = yield* Schema.encodeEffect(AdapterRosterDocumentJsonString)(document);
  const withNewline = encoded.endsWith('\n') ? encoded : `${encoded}\n`;
  yield* fs.writeFileString(filePath, withNewline);
});

/**
 * Run `effect` while holding `adapters/<launchTarget>/roster.lock` (`open` + `"wx"`).
 * RMW of the roster should run inside this helper; bare read/write stay for tests and full replace.
 */
export const withAdapterRosterLock = Effect.fn('withAdapterRosterLock')(function* <A, E, R>(
  launchTarget: LaunchTarget,
  effect: Effect.Effect<A, E, R>,
) {
  const fs = yield* FileSystem;
  yield* ensureHome();
  const dir = yield* adapterDirPath(launchTarget);
  yield* fs.makeDirectory(dir, { recursive: true });
  const lockPath = yield* adapterRosterLockPath(launchTarget);

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
