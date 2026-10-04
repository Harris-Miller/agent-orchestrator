import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { AdapterRosterDocumentJsonString, emptyAdapterRoster } from './AdapterRosterDocument.ts';
import type { AdapterRosterDocument } from './AdapterRosterDocument.ts';
import { ensureHome, resolveHome } from './home.ts';

/** kebab-case launch targets only (`gemini-acp`, `codex-acp`, …). Anything else is a programmer error. */
const LaunchTarget = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));

export const adapterDirPath = Effect.fn('adapterDirPath')(function* (launchTarget: string) {
  yield* Schema.decodeEffect(LaunchTarget)(launchTarget).pipe(Effect.orDie);
  const path = yield* Path;
  const home = yield* resolveHome();
  return path.join(home, 'adapters', launchTarget);
});

export const adapterRosterPath = Effect.fn('adapterRosterPath')(function* (launchTarget: string) {
  const path = yield* Path;
  const dir = yield* adapterDirPath(launchTarget);
  return path.join(dir, 'roster.json');
});

export const adapterRosterLockPath = Effect.fn('adapterRosterLockPath')(function* (launchTarget: string) {
  const path = yield* Path;
  const dir = yield* adapterDirPath(launchTarget);
  return path.join(dir, 'roster.lock');
});

export const readAdapterRoster = Effect.fn('readAdapterRoster')(function* (launchTarget: string) {
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
  launchTarget: string,
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
  launchTarget: string,
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
