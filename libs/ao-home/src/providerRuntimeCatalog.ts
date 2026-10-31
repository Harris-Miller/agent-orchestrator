/** Pure transitions over `ProviderRuntimeDocument`. Versions and cleanup targets come from the catalog, never a directory scan. */
import { providerRuntimeRelativeDir } from './providers.ts';
import type { ProviderDistribution, ProviderRuntimeDocument, ProviderRuntimeEntry } from './ProviderRuntimeDocument.ts';

const findEntry = (doc: ProviderRuntimeDocument, version: string): ProviderRuntimeEntry | undefined =>
  doc.catalog.find(entry => entry.version === version);

const requireEntry = (doc: ProviderRuntimeDocument, version: string): ProviderRuntimeEntry => {
  const entry = findEntry(doc, version);
  if (entry === undefined) {
    throw new Error(`Unknown provider runtime ${version}`);
  }
  return entry;
};

const replaceState = (
  doc: ProviderRuntimeDocument,
  version: string,
  state: ProviderRuntimeEntry['state'],
): ProviderRuntimeDocument => {
  requireEntry(doc, version);
  return { ...doc, catalog: doc.catalog.map(entry => (entry.version === version ? { ...entry, state } : entry)) };
};

/** Record a `downloading` attempt before its directory exists. Replaces any non-completed entry, never a completed one. */
export const beginRuntimeAttempt = (
  doc: ProviderRuntimeDocument,
  distribution: ProviderDistribution,
): ProviderRuntimeDocument => {
  const existing = findEntry(doc, distribution.version);
  if (existing?.state._tag === 'completed') {
    throw new Error(`Provider runtime ${distribution.version} already exists (${existing.state._tag})`);
  }
  const entry: ProviderRuntimeEntry = {
    version: distribution.version,
    dir: providerRuntimeRelativeDir(distribution.version),
    distribution,
    state: { _tag: 'downloading' },
  };
  return {
    ...doc,
    catalog: [...doc.catalog.filter(candidate => candidate.version !== distribution.version), entry],
  };
};

export const completeRuntimeAttempt = (doc: ProviderRuntimeDocument, version: string): ProviderRuntimeDocument =>
  replaceState(doc, version, { _tag: 'completed' });

export const failRuntimeAttempt = (
  doc: ProviderRuntimeDocument,
  version: string,
  error: string,
): ProviderRuntimeDocument => replaceState(doc, version, { _tag: 'failed', error });

export const markRuntimePendingDelete = (
  doc: ProviderRuntimeDocument,
  version: string,
  error: string,
): ProviderRuntimeDocument => {
  if (doc.active?.version === version) {
    throw new Error(`Cannot delete active provider runtime ${version}`);
  }
  return replaceState(doc, version, { _tag: 'pending-delete', error });
};

/** Drop an entry once its directory is gone. The active runtime is never removable. */
export const removeRuntimeEntry = (doc: ProviderRuntimeDocument, version: string): ProviderRuntimeDocument => {
  if (doc.active?.version === version) {
    throw new Error(`Cannot remove active provider runtime ${version}`);
  }
  return { ...doc, catalog: doc.catalog.filter(entry => entry.version !== version) };
};

/** Activate a completed entry. */
export const setActiveRuntime = (doc: ProviderRuntimeDocument, version: string): ProviderRuntimeDocument => {
  const entry = requireEntry(doc, version);
  if (entry.state._tag !== 'completed') {
    throw new Error(`Provider runtime ${version} is not completed (${entry.state._tag})`);
  }
  return { ...doc, active: { version: entry.version, dir: entry.dir } };
};

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
