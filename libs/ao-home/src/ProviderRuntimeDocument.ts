import { Schema } from 'effect';

import { providerRuntimeRelativeDir } from './providers.ts';

/** Path-safe runtime version segment: no separators, no leading dot, so it cannot escape `runtime/`. */
export const isSafeRuntimeVersion = (version: string): boolean => /^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(version);

const RuntimeVersionSchema = Schema.String.check(
  Schema.makeFilter(version => isSafeRuntimeVersion(version) || 'unsafe runtime version'),
);

/** Reference to a runtime directory relative to its provider directory. */
export const ProviderRuntimeRefSchema = Schema.Struct({
  version: RuntimeVersionSchema,
  dir: Schema.String,
});
export type ProviderRuntimeRef = typeof ProviderRuntimeRefSchema.Type;

/** Resolved, exact distribution recorded at Check time so Download and offline launch never re-resolve. */
export const ProviderDistributionSchema = Schema.Union([
  Schema.TaggedStruct('npm', {
    package: Schema.String,
    version: RuntimeVersionSchema,
  }),
  Schema.TaggedStruct('binary', {
    version: RuntimeVersionSchema,
    platform: Schema.String,
    archive: Schema.String,
    sha256: Schema.String,
    cmd: Schema.String,
    args: Schema.Array(Schema.String),
  }),
]);
export type ProviderDistribution = typeof ProviderDistributionSchema.Type;

/**
 * `downloading` — attempt recorded, not finished (stays distinguishable after a restart).
 * `completed` — process exited and required files validated.
 * `failed` — attempt failed; directory may still exist and awaits cleanup.
 * `pending-delete` — superseded/removed runtime whose deletion failed; retried at startup.
 */
export const ProviderDownloadStateSchema = Schema.Union([
  Schema.TaggedStruct('downloading', {}),
  Schema.TaggedStruct('completed', {}),
  Schema.TaggedStruct('failed', { error: Schema.String }),
  Schema.TaggedStruct('pending-delete', { error: Schema.String }),
]);
export type ProviderDownloadState = typeof ProviderDownloadStateSchema.Type;

export const ProviderRuntimeEntrySchema = Schema.Struct({
  version: RuntimeVersionSchema,
  dir: Schema.String,
  distribution: ProviderDistributionSchema,
  state: ProviderDownloadStateSchema,
});
export type ProviderRuntimeEntry = typeof ProviderRuntimeEntrySchema.Type;

export const PROVIDER_RUNTIME_DOCUMENT_SCHEMA_VERSION = 1 as const;

/**
 * `~/.ao/providers/<id>/current.json`: active runtime reference plus a catalog of known runtimes.
 * Invariants: dir === `runtime/<version>`, unique versions, active points at a completed entry.
 */
export const ProviderRuntimeDocumentSchema = Schema.Struct({
  schemaVersion: Schema.Literal(PROVIDER_RUNTIME_DOCUMENT_SCHEMA_VERSION),
  active: Schema.NullOr(ProviderRuntimeRefSchema),
  catalog: Schema.Array(ProviderRuntimeEntrySchema),
}).check(
  Schema.makeFilter(doc => {
    const seen = new Set<string>();
    for (const entry of doc.catalog) {
      if (entry.dir !== providerRuntimeRelativeDir(entry.version)) {
        return `catalog entry ${entry.version} has inconsistent dir ${entry.dir}`;
      }
      if (seen.has(entry.version)) {
        return `duplicate catalog version ${entry.version}`;
      }
      seen.add(entry.version);
      if (entry.distribution.version !== entry.version) {
        return `catalog entry ${entry.version} has mismatched distribution version`;
      }
    }
    const { active } = doc;
    if (active !== null) {
      if (active.dir !== providerRuntimeRelativeDir(active.version)) {
        return `active runtime ${active.version} has inconsistent dir ${active.dir}`;
      }
      const entry = doc.catalog.find(candidate => candidate.version === active.version);
      if (entry?.state._tag !== 'completed') {
        return `active runtime ${active.version} is not a completed catalog entry`;
      }
    }
    return true;
  }),
);
export type ProviderRuntimeDocument = typeof ProviderRuntimeDocumentSchema.Type;

export const ProviderRuntimeDocumentJsonString = Schema.fromJsonString(ProviderRuntimeDocumentSchema, { space: 2 });

export const emptyProviderRuntimeDocument: ProviderRuntimeDocument = {
  schemaVersion: PROVIDER_RUNTIME_DOCUMENT_SCHEMA_VERSION,
  active: null,
  catalog: [],
};
