/**
 * Antigravity ACP support files under `~/.ao/providers/antigravity-acp/`: `GEMINI_HOME` and the BROWSER helper.
 * The runtime itself (download, pinning, selection) lives in `providerRuntime` / `current.json`.
 */
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { ensureHome } from './home.ts';
import { antigravityProviderBrowserHelperPath, antigravityProviderHomeDir } from './providers.ts';

/** Logical spawn name; hosts map it to the active runtime's recorded command (never an arbitrary path). */
export const ANTIGRAVITY_ACP_SPAWN_NAME = 'agy_acp_server';

/** Stderr marker prefix for the capture-only `BROWSER` helper (Host OpenUrl opens the URL). */
export const ANTIGRAVITY_AUTH_URL_MARKER_PREFIX = 'AO_ANTIGRAVITY_AUTH_URL:';

/** Shell script body for the capture-only `BROWSER` helper (prints marker, does not open). */
export const antigravityBrowserHelperScript = `#!/bin/sh
printf '%s%s\\n' '${ANTIGRAVITY_AUTH_URL_MARKER_PREFIX}' "$1" >&2
`;

/** Host FS lacks chmod — set +x via shell under AO home. */
const chmodPlusX = (...paths: string[]) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const firstPath = paths[0] ?? '';
    const exitCode = yield* spawner.exitCode(ChildProcess.make('chmod', ['+x', ...paths], { extendEnv: true })).pipe(
      Effect.mapError(error =>
        PlatformError.systemError({
          _tag: 'Unknown',
          cause: error,
          description: error instanceof Error ? error.message : String(error),
          method: 'chmod',
          module: 'FileSystem',
          pathOrDescriptor: firstPath,
        }),
      ),
    );
    if (exitCode !== 0) {
      return yield* PlatformError.systemError({
        _tag: 'Unknown',
        description: `chmod exited ${String(exitCode)}`,
        method: 'chmod',
        module: 'FileSystem',
        pathOrDescriptor: firstPath,
      });
    }
  });

/** `GEMINI_HOME` (`providers/antigravity-acp/home`), created on demand. */
export const ensureAntigravityProviderHome = Effect.fn('ensureAntigravityProviderHome')(function* () {
  const fs = yield* FileSystem;
  yield* ensureHome();
  const homeDir = yield* antigravityProviderHomeDir();
  yield* fs.makeDirectory(homeDir, { recursive: true });
  return homeDir;
});

/** Write the capture-only `BROWSER` helper at `providers/antigravity-acp/browser-helper` and mark it executable. */
export const ensureAntigravityProviderBrowserHelper = Effect.fn('ensureAntigravityProviderBrowserHelper')(function* () {
  const fs = yield* FileSystem;
  const path = yield* Path;
  yield* ensureHome();
  const helperPath = yield* antigravityProviderBrowserHelperPath();
  yield* fs.makeDirectory(path.dirname(helperPath), { recursive: true });
  yield* fs.writeFileString(helperPath, antigravityBrowserHelperScript);
  yield* chmodPlusX(helperPath);
  return helperPath;
});
