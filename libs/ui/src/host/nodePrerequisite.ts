/** Global Node (>= 22) and npm prerequisite for provider runtimes. Pre-alpha: we rely on the user's own install. */
import { Effect, Option, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { ChildProcessSpawner } from 'effect/process';

import { runCapturedProcess } from './runCapturedProcess.ts';

export const MIN_NODE_MAJOR = 22;

/** Bound each probe so a hung shim can never block app bootstrap forever. */
const CHECK_TIMEOUT = '10 seconds' as const;

export type ToolStatus =
  | { readonly _tag: 'CheckFailed'; readonly message: string }
  | { readonly _tag: 'InvalidOutput'; readonly output: string }
  | { readonly _tag: 'Missing' }
  | { readonly _tag: 'NonZeroExit'; readonly exitCode: number }
  | { readonly _tag: 'Ok'; readonly version: string }
  | { readonly _tag: 'TimedOut' }
  | { readonly _tag: 'TooOld'; readonly version: string };

export type NodePrerequisite = {
  readonly node: ToolStatus;
  readonly npm: ToolStatus;
};

export const isNodePrerequisiteMet = ({ node, npm }: NodePrerequisite): boolean =>
  node._tag === 'Ok' && npm._tag === 'Ok';

/** `node --version` / `npm --version` output: optional `v`, then `major.minor.patch…`. */
const decodeToolVersion = Schema.decodeUnknownOption(
  Schema.TemplateLiteralParser([Schema.Literals(['v', '']), Schema.Int, '.', Schema.Int, '.', Schema.String]),
);

const isMissingExecutable = (error: PlatformError): boolean =>
  error.reason._tag === 'NotFound' || /not found|ENOENT|No such file|program not allowed/i.test(error.message);

const probe = (
  command: 'node' | 'npm',
  minMajor: number | undefined,
): Effect.Effect<ToolStatus, never, ChildProcessSpawner.ChildProcessSpawner> =>
  runCapturedProcess(command, ['--version']).pipe(
    Effect.timeoutOption(CHECK_TIMEOUT),
    Effect.map((result): ToolStatus => {
      if (result._tag === 'None') {
        return { _tag: 'TimedOut' };
      }
      const { exitCode, stdout } = result.value;
      if (exitCode !== 0) {
        return { _tag: 'NonZeroExit', exitCode };
      }
      const output = stdout.trim();
      const parsed = decodeToolVersion(output);
      if (Option.isNone(parsed)) {
        return { _tag: 'InvalidOutput', output: output.slice(0, 200) };
      }
      const [prefix, major] = parsed.value;
      const version = output.slice(prefix.length);
      return minMajor !== undefined && major < minMajor ? { _tag: 'TooOld', version } : { _tag: 'Ok', version };
    }),
    Effect.catch(error =>
      Effect.succeed<ToolStatus>(
        isMissingExecutable(error) ? { _tag: 'Missing' } : { _tag: 'CheckFailed', message: error.message },
      ),
    ),
  );

/** Probe `node --version` and `npm --version`. Never fails: every outcome is a typed status. */
export const checkNodePrerequisite = Effect.fn('checkNodePrerequisite')(function* () {
  const [node, npm] = yield* Effect.all([probe('node', MIN_NODE_MAJOR), probe('npm', undefined)], { concurrency: 2 });
  return { node, npm } satisfies NodePrerequisite;
});

/** Human text for one tool, for the blocking modal. */
export const describeToolStatus = (name: string, status: ToolStatus): string => {
  switch (status._tag) {
    case 'Ok':
      return `${name} ${status.version}`;
    case 'Missing':
      return `${name} not found`;
    case 'TooOld':
      return `${name} ${status.version} is too old (need >= ${String(MIN_NODE_MAJOR)})`;
    case 'InvalidOutput':
      return `${name} reported an unrecognised version`;
    case 'NonZeroExit':
      return `${name} exited ${String(status.exitCode)}`;
    case 'TimedOut':
      return `${name} timed out`;
    case 'CheckFailed':
      return `${name} could not be checked: ${status.message}`;
  }
};
