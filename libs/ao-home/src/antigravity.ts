/**
 * Antigravity ACP dirs under Agent Orchestrator home — paths, materialize, BROWSER helper.
 * Pin / download / env live in `@lib/ui` host.
 */
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { ensureHome, resolveHome } from './home.ts';

/** Pinned managed runtime version (keep in sync with Tauri shell cmd + ui host pin). */
export const ANTIGRAVITY_ACP_VERSION = '1.4.1';

/** Allowlist / Effect spawn name (not the on-disk `.par` filename). */
export const ANTIGRAVITY_ACP_SPAWN_NAME = 'agy_acp_server';

/** On-disk executable name for darwin/linux Google releases. */
export const ANTIGRAVITY_ACP_EXECUTABLE_NAME = 'agy_acp_server.par';

/** Sibling harness binary name for darwin/linux Google releases. */
export const ANTIGRAVITY_ACP_HARNESS_NAME = 'localharness_external';

/** Capture-only `BROWSER` helper under the Antigravity ACP root (not under home/runtime). */
export const ANTIGRAVITY_ACP_BROWSER_HELPER_NAME = 'browser-helper';

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

export const antigravityAcpRootDir = Effect.fn('antigravityAcpRootDir')(function* () {
  const path = yield* Path;
  const home = yield* resolveHome();
  return path.join(home, 'antigravity-acp');
});

/** Credential / profile home (`GEMINI_HOME`). */
export const antigravityAcpHomeDir = Effect.fn('antigravityAcpHomeDir')(function* () {
  const path = yield* Path;
  const root = yield* antigravityAcpRootDir();
  return path.join(root, 'home');
});

/** Absolute path for the controlled Antigravity `BROWSER` helper script. */
export const antigravityAcpBrowserHelperPath = Effect.fn('antigravityAcpBrowserHelperPath')(function* () {
  const path = yield* Path;
  const root = yield* antigravityAcpRootDir();
  return path.join(root, ANTIGRAVITY_ACP_BROWSER_HELPER_NAME);
});

export const antigravityAcpRuntimeDir = Effect.fn('antigravityAcpRuntimeDir')(function* (
  version: string = ANTIGRAVITY_ACP_VERSION,
) {
  const path = yield* Path;
  const root = yield* antigravityAcpRootDir();
  return path.join(root, 'runtime', version);
});

/** Path segments under AO home to the pinned executable (sync hosts / allowlists). */
export const antigravityAcpExecutableRelativeSegments = (
  version: string = ANTIGRAVITY_ACP_VERSION,
): readonly [string, string, string, string] => [
  'antigravity-acp',
  'runtime',
  version,
  ANTIGRAVITY_ACP_EXECUTABLE_NAME,
];

export const antigravityAcpExecutablePath = Effect.fn('antigravityAcpExecutablePath')(function* (
  version: string = ANTIGRAVITY_ACP_VERSION,
) {
  const path = yield* Path;
  const home = yield* resolveHome();
  return path.join(home, ...antigravityAcpExecutableRelativeSegments(version));
});

export const antigravityAcpHarnessPath = Effect.fn('antigravityAcpHarnessPath')(function* (
  version: string = ANTIGRAVITY_ACP_VERSION,
) {
  const path = yield* Path;
  const dir = yield* antigravityAcpRuntimeDir(version);
  return path.join(dir, ANTIGRAVITY_ACP_HARNESS_NAME);
});

export const ensureAntigravityAcpDirs = Effect.fn('ensureAntigravityAcpDirs')(function* (
  version: string = ANTIGRAVITY_ACP_VERSION,
) {
  const fs = yield* FileSystem;
  yield* ensureHome();
  const homeDir = yield* antigravityAcpHomeDir();
  const runtimeDir = yield* antigravityAcpRuntimeDir(version);
  yield* fs.makeDirectory(homeDir, { recursive: true });
  yield* fs.makeDirectory(runtimeDir, { recursive: true });
  return { homeDir, runtimeDir } as const;
});

/** True when both pin members already exist under the runtime dir. */
export const isAntigravityAcpRuntimePresent = Effect.fn('isAntigravityAcpRuntimePresent')(function* (
  version: string = ANTIGRAVITY_ACP_VERSION,
) {
  const fs = yield* FileSystem;
  const executable = yield* antigravityAcpExecutablePath(version);
  const harness = yield* antigravityAcpHarnessPath(version);
  return (yield* fs.exists(executable)) && (yield* fs.exists(harness));
});

export type AntigravityRuntimeSources = {
  readonly executableSourcePath: string;
  readonly harnessSourcePath: string;
  readonly version?: string;
};

/**
 * Copy verified extracted members into `runtime/<version>/` and mark them executable.
 * Callers own download / sha256 / extract outside AO home.
 */
export const materializeAntigravityAcpRuntime = Effect.fn('materializeAntigravityAcpRuntime')(function* (
  sources: AntigravityRuntimeSources,
) {
  const fs = yield* FileSystem;
  const version = sources.version ?? ANTIGRAVITY_ACP_VERSION;
  const { runtimeDir } = yield* ensureAntigravityAcpDirs(version);
  const executableDest = yield* antigravityAcpExecutablePath(version);
  const harnessDest = yield* antigravityAcpHarnessPath(version);

  yield* fs.copyFile(sources.executableSourcePath, executableDest);
  yield* fs.copyFile(sources.harnessSourcePath, harnessDest);
  yield* chmodPlusX(executableDest, harnessDest);

  return { executablePath: executableDest, harnessPath: harnessDest, runtimeDir } as const;
});

/** Write capture-only `BROWSER` helper under AO home and mark it executable. */
export const ensureAntigravityBrowserHelper = Effect.fn('ensureAntigravityBrowserHelper')(function* () {
  const fs = yield* FileSystem;
  yield* ensureHome();
  const root = yield* antigravityAcpRootDir();
  yield* fs.makeDirectory(root, { recursive: true });
  const helperPath = yield* antigravityAcpBrowserHelperPath();
  yield* fs.writeFileString(helperPath, antigravityBrowserHelperScript);
  yield* chmodPlusX(helperPath);
  return helperPath;
});
