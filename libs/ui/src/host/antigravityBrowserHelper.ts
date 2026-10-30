/**
 * Materialize capture-only Antigravity `BROWSER` helper under AO home.
 */
import { antigravityAcpBrowserHelperPath, antigravityAcpRootDir, ensureHome } from '@lib/ao-home';
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { antigravityBrowserHelperScript } from './antigravityAuthUrl.ts';
import { MissingLaunchPrerequisite } from './findExecutableOnPath.ts';

const asMissingPrerequisite = (message: string) =>
  new MissingLaunchPrerequisite({
    executable: 'agy_acp_server',
    message,
  });

const runShell = Effect.fn('runAntigravityBrowserHelperShell')(function* (
  command: string,
  args: readonly string[],
  failMessage: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner
    .spawn(ChildProcess.make(command, [...args], { extendEnv: true }))
    .pipe(Effect.mapError(error => asMissingPrerequisite(`${failMessage}: ${error.message}`)));
  const code = yield* handle.exitCode.pipe(
    Effect.mapError(error => asMissingPrerequisite(`${failMessage}: ${String(error)}`)),
  );
  if (code !== 0) {
    return yield* asMissingPrerequisite(`${failMessage} (exit ${String(code)})`);
  }
});

/** Ensure `~/.ao/antigravity-acp/browser-helper` exists and is executable. */
export const ensureAntigravityBrowserHelper = Effect.fn('ensureAntigravityBrowserHelper')(
  function* () {
    const fs = yield* FileSystem;
    yield* ensureHome().pipe(
      Effect.mapError(error => asMissingPrerequisite(`Antigravity home ensure failed: ${String(error)}`)),
    );
    const root = yield* antigravityAcpRootDir();
    yield* fs
      .makeDirectory(root, { recursive: true })
      .pipe(Effect.mapError(error => asMissingPrerequisite(`Antigravity root mkdir failed: ${String(error)}`)));
    const helperPath = yield* antigravityAcpBrowserHelperPath();
    yield* fs
      .writeFileString(helperPath, antigravityBrowserHelperScript)
      .pipe(
        Effect.mapError(error => asMissingPrerequisite(`Antigravity BROWSER helper write failed: ${String(error)}`)),
      );
    yield* runShell('chmod', ['+x', helperPath], 'Antigravity BROWSER helper chmod failed');
    return helperPath;
  },
  Effect.annotateLogs({ module: 'antigravityBrowserHelper' }),
);
