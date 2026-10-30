/**
 * Lazy download / verify / extract of pinned Antigravity ACP into ao-home runtime.
 */
import {
  ANTIGRAVITY_ACP_EXECUTABLE_NAME,
  ANTIGRAVITY_ACP_HARNESS_NAME,
  antigravityAcpHarnessPath,
  ensureAntigravityAcpDirs,
  isAntigravityAcpRuntimePresent,
  materializeAntigravityAcpRuntime,
} from '@lib/ao-home';
import { OS } from '@lib/context-services';
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { Path } from 'effect/Path';
import type * as PlatformError from 'effect/PlatformError';

import { resolveAntigravityReleaseAsset } from './antigravityRelease.ts';
import { asAntigravityMissingPrerequisite, runAntigravityShell } from './antigravityShell.ts';
import type { MissingLaunchPrerequisite } from './findExecutableOnPath.ts';

const asMissingPrerequisite = asAntigravityMissingPrerequisite;

const mapFs = <A, R>(
  effect: Effect.Effect<A, PlatformError.PlatformError, R>,
  detail: string,
): Effect.Effect<A, MissingLaunchPrerequisite, R> =>
  effect.pipe(Effect.mapError(error => asMissingPrerequisite(`${detail}: ${error.message}`)));

const sha256Hex = (bytes: ArrayBuffer): Effect.Effect<string> =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  });

/** Ensure pin 1.4.1 is on disk under ~/.ao/antigravity-acp/runtime/; idempotent. */
export const ensureAntigravityAcpInstalled = Effect.fn('ensureAntigravityAcpInstalled')(
  function* () {
    const os = yield* OS;
    const platform = os.platform();
    const arch = os.arch();
    const asset = resolveAntigravityReleaseAsset(platform, arch);
    if (asset === undefined) {
      return yield* asMissingPrerequisite(
        platform === 'win32'
          ? 'Antigravity ACP is not supported on Windows yet'
          : `Antigravity ACP has no pinned build for ${platform}-${arch}`,
      );
    }

    if (yield* mapFs(isAntigravityAcpRuntimePresent(asset.version), 'Antigravity runtime check failed')) {
      return;
    }

    yield* Effect.logInfo('Downloading Antigravity ACP', asset.version, asset.url);
    const http = yield* HttpClient.HttpClient;
    const response = yield* http.get(asset.url).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError(error =>
        asMissingPrerequisite(`Antigravity download failed: ${error instanceof Error ? error.message : String(error)}`),
      ),
    );
    const body = yield* response.arrayBuffer.pipe(
      Effect.mapError(error =>
        asMissingPrerequisite(
          `Antigravity download body failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
    );

    if (body.byteLength !== asset.archiveBytes) {
      return yield* asMissingPrerequisite(
        `Antigravity download size mismatch (got ${body.byteLength}, expected ${asset.archiveBytes})`,
      );
    }

    const digest = yield* sha256Hex(body);
    if (digest !== asset.sha256) {
      return yield* asMissingPrerequisite('Antigravity download failed its SHA-256 check');
    }

    const fs = yield* FileSystem;
    const path = yield* Path;
    const stagingRoot = yield* mapFs(
      fs.makeTempDirectory({ prefix: 'ao-antigravity-' }),
      'Antigravity staging directory failed',
    );
    const archivePath = path.join(stagingRoot, 'download.zip');
    const extractDir = path.join(stagingRoot, 'extract');
    yield* mapFs(fs.makeDirectory(extractDir, { recursive: true }), 'Antigravity extract directory failed');
    yield* mapFs(fs.writeFile(archivePath, new Uint8Array(body)), 'Antigravity archive write failed');

    yield* runAntigravityShell(
      'unzip',
      ['-o', archivePath, '-d', extractDir],
      'Antigravity archive extract failed (`unzip`)',
    );

    const executableSource = path.join(extractDir, ANTIGRAVITY_ACP_EXECUTABLE_NAME);
    const harnessSource = path.join(extractDir, ANTIGRAVITY_ACP_HARNESS_NAME);
    const hasExecutable = yield* mapFs(fs.exists(executableSource), 'Antigravity executable check failed');
    const hasHarness = yield* mapFs(fs.exists(harnessSource), 'Antigravity harness check failed');
    if (!hasExecutable || !hasHarness) {
      return yield* asMissingPrerequisite('Antigravity archive did not contain the expected binaries');
    }

    yield* mapFs(
      materializeAntigravityAcpRuntime({
        executableSourcePath: executableSource,
        harnessSourcePath: harnessSource,
        version: asset.version,
      }),
      'Antigravity materialize failed',
    );

    const { runtimeDir } = yield* mapFs(ensureAntigravityAcpDirs(asset.version), 'Antigravity runtime dirs failed');
    const executableDest = path.join(runtimeDir, ANTIGRAVITY_ACP_EXECUTABLE_NAME);
    const harnessDest = yield* mapFs(antigravityAcpHarnessPath(asset.version), 'Antigravity harness path failed');
    yield* runAntigravityShell('chmod', ['+x', executableDest, harnessDest], 'Antigravity runtime chmod failed');

    yield* Effect.logInfo('Antigravity ACP runtime ready', asset.version);
  },
  Effect.annotateLogs({ module: 'antigravityInstall' }),
);
