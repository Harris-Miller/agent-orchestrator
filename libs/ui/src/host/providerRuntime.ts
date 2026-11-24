/**
 * Provider runtimes under `~/.hoa/providers/<id>/`: resolve the latest version, download in the background,
 * clean up, and resolve the active runtime for launch. State lives in `current.json` (see `@lib/hoa-home`).
 */
import { annotateLaunchTargetLogs } from './sessionTelemetry.ts';
import {
  beginRuntimeAttempt,
  cleanupTargets,
  clearActiveRuntime,
  completeRuntimeAttempt,
  downloadedRuntimes,
  emptyProviderRuntimeDocument,
  failRuntimeAttempt,
  markRuntimePendingDelete,
  PROVIDER_NPM_PACKAGES,
  providerRuntimeDir,
  readProviderRuntimeState,
  ReleaseVersionSchema,
  removeRuntimeEntry,
  setActiveRuntime,
  supersededRuntimes,
  writeProviderRuntimeDocument,
} from '@lib/hoa-home';
import type {
  LaunchTarget,
  NpmProviderId,
  ProviderDistribution,
  ProviderRuntimeDocument,
  ProviderRuntimeEntry,
  ProviderRuntimeTransitionError,
} from '@lib/hoa-home';
import { OS } from '@lib/context-services';
import { Effect, Result, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { Path } from 'effect/Path';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { fetchAntigravityDistribution } from './antigravityRegistry.ts';
import { MissingLaunchPrerequisite } from './findExecutableOnPath.ts';
import { PROVIDER_META } from './providerView.ts';
import { runCapturedProcess } from './runCapturedProcess.ts';

/** Launch targets whose runtime is user-downloaded under `~/.hoa/providers`: the ones `PROVIDER_META` gives a runtime. */
export type ManagedProviderLaunchTarget = {
  [K in AgentLaunchTarget]: (typeof PROVIDER_META)[K]['runtime'] extends undefined ? never : K;
}[AgentLaunchTarget];

/** Second required Antigravity member beside the registry command. */
export const ANTIGRAVITY_HARNESS_MEMBER = 'localharness_external';

export const isManagedProvider = (launchTarget: AgentLaunchTarget): launchTarget is ManagedProviderLaunchTarget =>
  PROVIDER_META[launchTarget].runtime !== undefined;

export class ProviderRuntimeError extends Schema.TaggedError<ProviderRuntimeError>()('ProviderRuntimeError', {
  launchTarget: Schema.String,
  message: Schema.String,
}) {}

const isRuntimeVersion = Schema.is(ReleaseVersionSchema);

const asTarget = (launchTarget: ManagedProviderLaunchTarget): LaunchTarget => launchTarget as LaunchTarget;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const fail = (launchTarget: ManagedProviderLaunchTarget, message: string) =>
  new ProviderRuntimeError({ launchTarget, message });

/** Adapter entry inside an npm runtime directory. */
export const npmAdapterEntryRelativePath = (launchTarget: NpmProviderId): string =>
  `node_modules/${PROVIDER_NPM_PACKAGES[launchTarget]}/dist/index.js`;

/** Files that must exist before a runtime may be marked completed. */
export const requiredRuntimeFiles = (launchTarget: ManagedProviderLaunchTarget, distribution: ProviderDistribution) =>
  distribution._tag === 'npm'
    ? [npmAdapterEntryRelativePath(launchTarget as NpmProviderId)]
    : [distribution.cmd, ANTIGRAVITY_HARNESS_MEMBER];

const mapProviderError = <A, E extends { readonly message: string }, R>(
  launchTarget: ManagedProviderLaunchTarget,
  effect: Effect.Effect<A, E, R>,
  detail: string,
) => effect.pipe(Effect.mapError(error => fail(launchTarget, `${detail}: ${error.message}`)));

// ---------------------------------------------------------------------------------------------
// current.json access
// ---------------------------------------------------------------------------------------------

/** Missing → empty document. Malformed/unreadable → error (never an instruction to seed or delete). */
const readDocument = (launchTarget: ManagedProviderLaunchTarget) =>
  mapProviderError(
    launchTarget,
    readProviderRuntimeState(asTarget(launchTarget)).pipe(
      Effect.map(state => (state._tag === 'Present' ? state.document : emptyProviderRuntimeDocument)),
    ),
    'Could not read provider state',
  );

/** Re-read, transform, publish atomically. */
const updateDocument = Effect.fnUntraced(function* (
  launchTarget: ManagedProviderLaunchTarget,
  transform: (
    document: ProviderRuntimeDocument,
  ) => Result.Result<ProviderRuntimeDocument, ProviderRuntimeTransitionError>,
) {
  const current = yield* readDocument(launchTarget);
  const document = yield* Effect.fromResult(transform(current)).pipe(
    Effect.mapError(error => fail(launchTarget, `Invalid provider state transition: ${error.message}`)),
  );
  yield* mapProviderError(
    launchTarget,
    writeProviderRuntimeDocument(asTarget(launchTarget), document),
    'Could not write provider state',
  );
  return document;
});

// ---------------------------------------------------------------------------------------------
// Resolve latest
// ---------------------------------------------------------------------------------------------

/** `npm view <pkg>@latest version` → exact validated package/version descriptor. */
const resolveNpmDistribution = Effect.fn('resolveNpmDistribution')(function* (launchTarget: NpmProviderId) {
  const pkg = PROVIDER_NPM_PACKAGES[launchTarget];
  const result = yield* runCapturedProcess('npm', ['view', `${pkg}@latest`, 'version']).pipe(
    Effect.mapError(error => fail(launchTarget, `npm view failed to start: ${error.message}`)),
  );
  const version = result.stdout.trim();
  if (result.exitCode !== 0) {
    return yield* fail(launchTarget, `npm view exited ${String(result.exitCode)}: ${result.stderr.trim()}`);
  }
  if (!isRuntimeVersion(version)) {
    return yield* fail(launchTarget, `npm view returned an invalid version: ${JSON.stringify(version)}`);
  }
  return { _tag: 'npm', package: pkg, version } satisfies ProviderDistribution;
});

/** Manual "Check for latest". Pure network/metadata; never touches the active runtime or sessions. */
export const resolveLatestRuntime = Effect.fn('resolveLatestRuntime')(function* (
  launchTarget: ManagedProviderLaunchTarget,
) {
  if (launchTarget === 'antigravity-acp') {
    const os = yield* OS;
    return yield* mapProviderError(
      launchTarget,
      fetchAntigravityDistribution(os.platform(), os.arch()),
      'Antigravity registry',
    );
  }
  return yield* resolveNpmDistribution(launchTarget);
});

// ---------------------------------------------------------------------------------------------
// Validate / remove directories
// ---------------------------------------------------------------------------------------------

const missingRequiredFiles = Effect.fnUntraced(function* (
  launchTarget: ManagedProviderLaunchTarget,
  runtimeDir: string,
  distribution: ProviderDistribution,
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  const missing: string[] = [];
  for (const relative of requiredRuntimeFiles(launchTarget, distribution)) {
    const present = yield* fs.exists(path.join(runtimeDir, relative)).pipe(Effect.orElseSucceed(() => false));
    if (!present) {
      missing.push(relative);
    }
  }
  return missing;
});

/**
 * Delete runtime directories and drop their catalog entries. A failed deletion stays in the catalog as
 * `pending-delete` (retried at startup). The active runtime is never touched. Returns the failures.
 */
export const purgeRuntimes = Effect.fn('purgeRuntimes')(function* (
  launchTarget: ManagedProviderLaunchTarget,
  entries: readonly ProviderRuntimeEntry[],
) {
  const fs = yield* FileSystem;
  const document = yield* readDocument(launchTarget);
  const targets = entries.filter(entry => entry.version !== document.active?.version);
  const failures: { readonly error: string; readonly version: string }[] = [];
  for (const entry of targets) {
    const dir = yield* mapProviderError(
      launchTarget,
      providerRuntimeDir(asTarget(launchTarget), entry.version),
      'Runtime path',
    );
    yield* fs.remove(dir, { force: true, recursive: true }).pipe(
      Effect.catch(error =>
        Effect.sync(() => {
          failures.push({ error: error.message, version: entry.version });
        }),
      ),
    );
  }
  yield* updateDocument(launchTarget, current =>
    Result.gen(function* () {
      let next = current;
      const present = targets.filter(entry => current.catalog.some(candidate => candidate.version === entry.version));
      for (const entry of present) {
        const failure = failures.find(candidate => candidate.version === entry.version);
        next = yield* failure === undefined
          ? removeRuntimeEntry(next, entry.version)
          : markRuntimePendingDelete(next, entry.version, failure.error);
      }
      return next;
    }),
  );
  return failures;
});

/** Startup: remove incomplete attempts, failed attempts and failed deletions recorded in the catalog. */
export const cleanupProviderRuntimes = Effect.fn('cleanupProviderRuntimes')(function* (
  launchTarget: ManagedProviderLaunchTarget,
) {
  const document = yield* readDocument(launchTarget);
  const targets = cleanupTargets(document);
  if (targets.length === 0) {
    return [];
  }
  return yield* purgeRuntimes(launchTarget, targets);
});

// ---------------------------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------------------------

const sha256Hex = (bytes: ArrayBuffer): Effect.Effect<string> =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  });

/** Every non-zero exit, spawn failure or missing executable is a failure. */
const runChecked = Effect.fnUntraced(function* (
  launchTarget: ManagedProviderLaunchTarget,
  command: string,
  args: readonly string[],
  detail: string,
) {
  const result = yield* runCapturedProcess(command, args).pipe(
    Effect.mapError(error => fail(launchTarget, `${detail} (spawn: ${error.message})`)),
  );
  if (result.exitCode !== 0) {
    const output = (result.stderr.trim() || result.stdout.trim()).slice(-2000);
    return yield* fail(launchTarget, `${detail} (exit ${String(result.exitCode)}): ${output}`);
  }
});

const installNpm = Effect.fnUntraced(function* (
  launchTarget: NpmProviderId,
  distribution: Extract<ProviderDistribution, { readonly _tag: 'npm' }>,
  runtimeDir: string,
) {
  if (distribution.package !== PROVIDER_NPM_PACKAGES[launchTarget] || !isRuntimeVersion(distribution.version)) {
    return yield* fail(launchTarget, `Refusing to install ${distribution.package}@${distribution.version}`);
  }
  yield* runChecked(
    launchTarget,
    'npm',
    [
      'install',
      '--prefix',
      runtimeDir,
      '--omit=optional',
      '--ignore-scripts',
      `${distribution.package}@${distribution.version}`,
    ],
    'npm install failed',
  );
});

const installAntigravity = Effect.fnUntraced(function* (
  distribution: Extract<ProviderDistribution, { readonly _tag: 'binary' }>,
  runtimeDir: string,
) {
  const launchTarget = 'antigravity-acp' as const;
  const fs = yield* FileSystem;
  const path = yield* Path;
  const http = yield* HttpClient.HttpClient;

  const body = yield* http.get(distribution.archive).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(response => response.arrayBuffer),
    Effect.mapError(error => fail(launchTarget, `Antigravity download failed: ${errorMessage(error)}`)),
  );
  if ((yield* sha256Hex(body)) !== distribution.sha256) {
    return yield* fail(launchTarget, 'Antigravity download failed its SHA-256 check');
  }

  const staging = yield* mapProviderError(
    launchTarget,
    fs.makeTempDirectory({ prefix: 'hoa-antigravity-' }),
    'Antigravity staging directory failed',
  );
  yield* Effect.gen(function* () {
    const archivePath = path.join(staging, 'download.zip');
    const extractDir = path.join(staging, 'extract');
    yield* mapProviderError(launchTarget, fs.makeDirectory(extractDir, { recursive: true }), 'Extract directory');
    yield* mapProviderError(launchTarget, fs.writeFile(archivePath, new Uint8Array(body)), 'Archive write');
    yield* runChecked(
      launchTarget,
      'unzip',
      ['-o', archivePath, '-d', extractDir],
      'Antigravity archive extract failed',
    );
    const members = [distribution.cmd, ANTIGRAVITY_HARNESS_MEMBER];
    for (const member of members) {
      const source = path.join(extractDir, member);
      if (!(yield* mapProviderError(launchTarget, fs.exists(source), `Check ${member}`))) {
        return yield* fail(launchTarget, `Antigravity archive did not contain ${member}`);
      }
      yield* mapProviderError(launchTarget, fs.copyFile(source, path.join(runtimeDir, member)), `Copy ${member}`);
    }
    yield* runChecked(
      launchTarget,
      'chmod',
      ['+x', ...members.map(member => path.join(runtimeDir, member))],
      'Antigravity chmod failed',
    );
  }).pipe(Effect.ensuring(fs.remove(staging, { force: true, recursive: true }).pipe(Effect.ignore)));
});

export type DownloadOutcome = {
  /** True when this was the first runtime and it became active. */
  readonly activated: boolean;
  readonly version: string;
};

/**
 * Background Download of an already-resolved descriptor. Never touches the active runtime directory:
 * the attempt is cataloged first, installs into its own directory, and is marked completed only after
 * the process exits and the required files validate. The first completed runtime activates automatically.
 */
export const downloadProviderRuntime = Effect.fn('downloadProviderRuntime')(function* (
  launchTarget: ManagedProviderLaunchTarget,
  distribution: ProviderDistribution,
) {
  if ((distribution._tag === 'npm') !== (launchTarget !== 'antigravity-acp')) {
    return yield* fail(launchTarget, 'Distribution does not match provider');
  }
  const fs = yield* FileSystem;
  const { version } = distribution;
  const runtimeDir = yield* mapProviderError(
    launchTarget,
    providerRuntimeDir(asTarget(launchTarget), version),
    'Runtime path',
  );

  const existing = (yield* readDocument(launchTarget)).catalog.find(entry => entry.version === version);
  if (existing?.state._tag === 'completed') {
    if ((yield* missingRequiredFiles(launchTarget, runtimeDir, existing.distribution)).length === 0) {
      return { activated: false, version } satisfies DownloadOutcome;
    }
    return yield* fail(launchTarget, `Runtime ${version} is cataloged but its files are incomplete`);
  }

  // Record the attempt before its directory exists.
  yield* updateDocument(launchTarget, document => beginRuntimeAttempt(document, distribution));

  const attempt = Effect.gen(function* () {
    // Clear leftovers from a previous interrupted attempt of the same version.
    yield* mapProviderError(launchTarget, fs.remove(runtimeDir, { force: true, recursive: true }), 'Clear attempt');
    yield* mapProviderError(
      launchTarget,
      fs.makeDirectory(runtimeDir, { recursive: true }),
      'Create runtime directory',
    );
    if (distribution._tag === 'npm') {
      yield* installNpm(launchTarget as NpmProviderId, distribution, runtimeDir);
    } else {
      yield* installAntigravity(distribution, runtimeDir);
    }
    const missing = yield* missingRequiredFiles(launchTarget, runtimeDir, distribution);
    if (missing.length > 0) {
      return yield* fail(launchTarget, `Runtime ${version} is missing ${missing.join(', ')}`);
    }
    const document = yield* updateDocument(launchTarget, current =>
      completeRuntimeAttempt(current, version).pipe(
        Result.flatMap(completed =>
          completed.active === null ? setActiveRuntime(completed, version) : Result.succeed(completed),
        ),
      ),
    );
    return { activated: document.active?.version === version, version } satisfies DownloadOutcome;
  });

  // Deletion error of a failed attempt, so the caller sees both errors.
  const cleanupFailure: { message?: string } = {};
  return yield* attempt.pipe(
    Effect.onExit(exit =>
      exit._tag === 'Success'
        ? Effect.void
        : // Failure, defect or cancellation: remove the destination; keep a failed entry only if deletion fails.
          Effect.uninterruptible(
            Effect.gen(function* () {
              const removal = yield* fs.remove(runtimeDir, { force: true, recursive: true }).pipe(Effect.result);
              if (removal._tag === 'Failure') {
                cleanupFailure.message = removal.failure.message;
              }
              yield* updateDocument(launchTarget, current =>
                removal._tag === 'Success'
                  ? removeRuntimeEntry(current, version)
                  : failRuntimeAttempt(current, version, removal.failure.message),
              ).pipe(Effect.ignore);
            }),
          ),
    ),
    Effect.mapError(error =>
      cleanupFailure.message === undefined
        ? error
        : fail(
            launchTarget,
            `${error.message}; cleanup of the runtime directory also failed: ${cleanupFailure.message}`,
          ),
    ),
  );
});

// ---------------------------------------------------------------------------------------------
// Launch resolution
// ---------------------------------------------------------------------------------------------

export type ActiveRuntime = {
  readonly distribution: ProviderDistribution;
  readonly runtimeDir: string;
  readonly version: string;
};

const downloadInstructions = (launchTarget: ManagedProviderLaunchTarget): string =>
  `Download the runtime in Settings > Providers (${launchTarget})`;

/**
 * Re-read `current.json` and return the active, validated runtime. Called before every spawn so a change from
 * another instance is picked up on the next harness start. Missing or incomplete → `MissingLaunchPrerequisite`.
 */
export const resolveActiveRuntime = Effect.fn('resolveActiveRuntime')(function* (
  launchTarget: ManagedProviderLaunchTarget,
) {
  const missing = (message: string) => new MissingLaunchPrerequisite({ executable: launchTarget, message });
  const state = yield* readProviderRuntimeState(asTarget(launchTarget)).pipe(
    Effect.mapError(error => missing(`Provider state is unreadable: ${error.message}`)),
  );
  if (state._tag === 'Missing' || state.document.active === null) {
    return yield* missing(`No ${launchTarget} runtime installed. ${downloadInstructions(launchTarget)}`);
  }
  const { active, catalog } = state.document;
  const entry = catalog.find(candidate => candidate.version === active.version);
  if (entry === undefined) {
    return yield* missing(`Active ${launchTarget} runtime is not cataloged. ${downloadInstructions(launchTarget)}`);
  }
  const runtimeDir = yield* providerRuntimeDir(asTarget(launchTarget), active.version);
  const absent = yield* missingRequiredFiles(launchTarget, runtimeDir, entry.distribution);
  if (absent.length > 0) {
    return yield* missing(
      `Active ${launchTarget} runtime ${active.version} is incomplete (${absent.join(', ')}). Remove it in Settings > Providers, then Download again`,
    );
  }
  return {
    distribution: entry.distribution,
    runtimeDir,
    version: active.version,
  } satisfies ActiveRuntime;
});

// ---------------------------------------------------------------------------------------------
// Install / Remove (JSON publication; the caller owns the local stop and restart)
// ---------------------------------------------------------------------------------------------

/** Install step 1: publish the chosen completed runtime as active. */
export const activateDownloadedRuntime = Effect.fn('activateDownloadedRuntime')(function* (
  launchTarget: ManagedProviderLaunchTarget,
  version: string,
) {
  yield* updateDocument(launchTarget, document => setActiveRuntime(document, version));
});

/** Remove step 1: publish "no active runtime". Entries stay cataloged until their directories are deleted. */
export const deactivateRuntime = Effect.fn('deactivateRuntime')(function* (launchTarget: ManagedProviderLaunchTarget) {
  yield* updateDocument(launchTarget, document => Result.succeed(clearActiveRuntime(document)));
});

/** After the local provider has stopped: delete every superseded runtime, including never-activated downloads. */
export const purgeSupersededRuntimes = Effect.fn('purgeSupersededRuntimes')(function* (
  launchTarget: ManagedProviderLaunchTarget,
) {
  const document = yield* readDocument(launchTarget);
  return yield* purgeRuntimes(launchTarget, supersededRuntimes(document));
});

/** Remove: after deactivation and the local stop, delete every cataloged runtime directory. */
export const purgeAllRuntimes = Effect.fn('purgeAllRuntimes')(function* (launchTarget: ManagedProviderLaunchTarget) {
  const document = yield* readDocument(launchTarget);
  return yield* purgeRuntimes(launchTarget, document.catalog);
});

export type RuntimeSnapshot = {
  readonly active: string | undefined;
  readonly cleanupFailures: readonly { readonly error: string; readonly version: string }[];
  /** Completed runtimes that are not active. */
  readonly downloaded: readonly string[];
};

/** Read-only view of `current.json` for the UI. Malformed / unreadable state is an error, never an empty view. */
export const readRuntimeSnapshot = Effect.fn('readRuntimeSnapshot')(function* (
  launchTarget: ManagedProviderLaunchTarget,
) {
  const document = yield* readDocument(launchTarget);
  return {
    active: document.active?.version,
    cleanupFailures: document.catalog.flatMap(entry =>
      entry.state._tag === 'pending-delete' || entry.state._tag === 'failed'
        ? [{ error: entry.state.error, version: entry.version }]
        : [],
    ),
    downloaded: downloadedRuntimes(document).map(entry => entry.version),
  } satisfies RuntimeSnapshot;
});

/** Startup: remove incomplete attempts and failed deletions for every managed provider. Never fails the caller. */
export const runStartupRuntimeCleanup = Effect.fn('runStartupRuntimeCleanup')(function* (
  launchTargets: readonly AgentLaunchTarget[],
) {
  yield* Effect.forEach(
    launchTargets.filter(isManagedProvider),
    launchTarget =>
      cleanupProviderRuntimes(launchTarget).pipe(
        Effect.catchCause(cause =>
          Effect.logWarning('provider runtime startup cleanup failed', cause).pipe(
            annotateLaunchTargetLogs(launchTarget),
          ),
        ),
      ),
    { concurrency: 'unbounded', discard: true },
  );
});
