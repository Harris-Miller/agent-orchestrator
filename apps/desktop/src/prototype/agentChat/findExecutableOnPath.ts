/**
 * Resolve an executable name against the host PATH using OS + Path + FileSystem.
 */
import { OS } from '@lib/context-services';
import { Effect, Option, Schema } from 'effect';
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
export const findExecutableOnPath = Effect.fn('findExecutableOnPath')(function* (name: string) {
  const os = yield* OS;
  const path = yield* Path;
  const fs = yield* FileSystem;

  const env: Readonly<Record<string, string | undefined>> = os.env();
  const pathEnv = env.PATH ?? env.Path ?? '';
  const platform = os.platform();
  const directories = pathEnv.split(pathListSeparator(platform)).filter(directory => directory.length > 0);

  for (const directory of directories) {
    for (const candidate of executableCandidates(platform, directory, name, path)) {
      if (yield* fs.exists(candidate)) {
        return Option.some(candidate);
      }
    }
  }

  return Option.none<string>();
});

/** Absolute path for `name` on PATH, or {@link MissingLaunchPrerequisite}. */
export const requireExecutableOnPath = Effect.fn('requireExecutableOnPath')(function* (name: string) {
  const found = yield* findExecutableOnPath(name);
  if (Option.isNone(found)) {
    return yield* new MissingLaunchPrerequisite({
      executable: name,
      message: `\`${name}\` not found on PATH`,
    });
  }
  return found.value;
});
