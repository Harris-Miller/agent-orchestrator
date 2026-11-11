/**
 * Resolve an executable name against the host PATH using OS + Path + FileSystem.
 */
import { OS } from '@lib/context-services';
import { Effect, Option, Redacted, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

export class MissingLaunchPrerequisite extends Schema.TaggedError<MissingLaunchPrerequisite>()(
  'MissingLaunchPrerequisite',
  {
    executable: Schema.String,
    message: Schema.String,
  },
) {}

const pathListSeparator = (platform: string): string => (platform === 'win32' ? ';' : ':');

const executableCandidates = (platform: string, directory: string, name: string, path: Path): readonly string[] => {
  if (platform === 'win32') {
    return [path.join(directory, `${name}.exe`), path.join(directory, `${name}.cmd`), path.join(directory, name)];
  }
  return [path.join(directory, name)];
};

/** First absolute path for `name` on PATH, if any. */
export const findExecutableOnPath = Effect.fn('findExecutableOnPath')(
  function* (name: string) {
    const os = yield* OS;
    const path = yield* Path;
    const fs = yield* FileSystem;

    const env: Readonly<Record<string, string | undefined>> = os.env();
    const pathEnv = env.PATH ?? env.Path ?? '';
    const platform = os.platform();
    const directories = pathEnv.split(pathListSeparator(platform)).filter(directory => directory.length > 0);

    for (const directory of directories) {
      for (const candidate of executableCandidates(platform, directory, name, path)) {
        // Tauri fs scope rejects many PATH dirs / Homebrew symlinks as non-NotFound errors.
        // Treat any exists failure as absent and keep scanning.
        const present = yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false));
        if (present) {
          yield* Effect.logDebug('Found executable on PATH', name, Redacted.make(candidate));
          return Option.some(candidate);
        }
      }
    }

    yield* Effect.logDebug('Executable not found on PATH', name);
    return Option.none<string>();
  },
  Effect.annotateLogs({ module: 'findExecutableOnPath' }),
);

/** Absolute path for `name` on PATH, or {@link MissingLaunchPrerequisite}. */
export const requireExecutableOnPath = Effect.fn('requireExecutableOnPath')(
  function* (name: string) {
    const found = yield* findExecutableOnPath(name);
    if (Option.isNone(found)) {
      yield* Effect.logWarning('Missing launch prerequisite', name);
      return yield* new MissingLaunchPrerequisite({
        executable: name,
        message: `\`${name}\` not found on PATH`,
      });
    }
    return found.value;
  },
  Effect.annotateLogs({ module: 'findExecutableOnPath' }),
);
