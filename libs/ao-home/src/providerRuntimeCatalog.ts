/** Pure transitions over `ProviderRuntimeDocument`. Versions and cleanup targets come from the catalog, never a directory scan. */
import { Result, Schema } from 'effect';

import { providerRuntimeRelativeDir } from './providers.ts';
import type { ProviderDistribution, ProviderRuntimeDocument, ProviderRuntimeEntry } from './ProviderRuntimeDocument.ts';

/** A transition the catalog refuses: unknown version, overwriting a completed runtime, or touching the active one. */
export class ProviderRuntimeTransitionError extends Schema.TaggedError<ProviderRuntimeTransitionError>()(
  'ProviderRuntimeTransitionError',
  {
    version: Schema.String,
    message: Schema.String,
  },
) {}

type Transition = Result.Result<ProviderRuntimeDocument, ProviderRuntimeTransitionError>;

const refuse = (version: string, message: string) =>
  Result.fail(new ProviderRuntimeTransitionError({ message, version }));

const findEntry = (doc: ProviderRuntimeDocument, version: string): ProviderRuntimeEntry | undefined =>
  doc.catalog.find(entry => entry.version === version);

const requireEntry = (
  doc: ProviderRuntimeDocument,
  version: string,
): Result.Result<ProviderRuntimeEntry, ProviderRuntimeTransitionError> => {
  const entry = findEntry(doc, version);
  return entry === undefined ? refuse(version, `Unknown provider runtime ${version}`) : Result.succeed(entry);
};

const replaceState = (
  doc: ProviderRuntimeDocument,
  version: string,
  state: ProviderRuntimeEntry['state'],
): Transition =>
  requireEntry(doc, version).pipe(
    Result.map(() => ({
      ...doc,
      catalog: doc.catalog.map(entry => (entry.version === version ? { ...entry, state } : entry)),
    })),
  );

/** Record a `downloading` attempt before its directory exists. Replaces any non-completed entry, never a completed one. */
export const beginRuntimeAttempt = (doc: ProviderRuntimeDocument, distribution: ProviderDistribution): Transition => {
  const existing = findEntry(doc, distribution.version);
  if (existing?.state._tag === 'completed') {
    return refuse(
      distribution.version,
      `Provider runtime ${distribution.version} already exists (${existing.state._tag})`,
    );
  }
  const entry: ProviderRuntimeEntry = {
    version: distribution.version,
    dir: providerRuntimeRelativeDir(distribution.version),
    distribution,
    state: { _tag: 'downloading' },
  };
  return Result.succeed({
    ...doc,
    catalog: [...doc.catalog.filter(candidate => candidate.version !== distribution.version), entry],
  });
};

export const completeRuntimeAttempt = (doc: ProviderRuntimeDocument, version: string): Transition =>
  replaceState(doc, version, { _tag: 'completed' });

export const failRuntimeAttempt = (doc: ProviderRuntimeDocument, version: string, error: string): Transition =>
  replaceState(doc, version, { _tag: 'failed', error });

export const markRuntimePendingDelete = (doc: ProviderRuntimeDocument, version: string, error: string): Transition => {
  if (doc.active?.version === version) {
    return refuse(version, `Cannot delete active provider runtime ${version}`);
  }
  return replaceState(doc, version, { _tag: 'pending-delete', error });
};

/** Drop an entry once its directory is gone. The active runtime is never removable. */
export const removeRuntimeEntry = (doc: ProviderRuntimeDocument, version: string): Transition =>
  doc.active?.version === version
    ? refuse(version, `Cannot remove active provider runtime ${version}`)
    : Result.succeed({ ...doc, catalog: doc.catalog.filter(entry => entry.version !== version) });

/** Activate a completed entry. */
export const setActiveRuntime = (doc: ProviderRuntimeDocument, version: string): Transition =>
  requireEntry(doc, version).pipe(
    Result.flatMap(entry =>
      entry.state._tag === 'completed'
        ? Result.succeed({ ...doc, active: { version: entry.version, dir: entry.dir } })
        : refuse(version, `Provider runtime ${version} is not completed (${entry.state._tag})`),
    ),
  );

/** Remove-runtime: no active runtime; catalog entries are kept for the caller to delete. */
export const clearActiveRuntime = (doc: ProviderRuntimeDocument): ProviderRuntimeDocument => ({ ...doc, active: null });

/** Completed runtimes other than the active one (downloaded updates). */
export const downloadedRuntimes = (doc: ProviderRuntimeDocument): readonly ProviderRuntimeEntry[] =>
  doc.catalog.filter(entry => entry.state._tag === 'completed' && entry.version !== doc.active?.version);

/** Every entry except the active one: what Install deletes after switching. */
export const supersededRuntimes = (doc: ProviderRuntimeDocument): readonly ProviderRuntimeEntry[] =>
  doc.catalog.filter(entry => entry.version !== doc.active?.version);

/** Startup cleanup: incomplete attempts, failed attempts and failed deletions. Skips the active runtime. */
export const cleanupTargets = (doc: ProviderRuntimeDocument): readonly ProviderRuntimeEntry[] =>
  doc.catalog.filter(entry => entry.state._tag !== 'completed' && entry.version !== doc.active?.version);
