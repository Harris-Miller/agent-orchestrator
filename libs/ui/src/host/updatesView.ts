/** Updates indicator presentation model: pending Provider and App updates as rows. Pure, no atoms or host services. */
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { readyToInstallVersion } from './providerView.ts';
import type { ProviderView } from './providerView.ts';

/** Desktop app update lifecycle (the Tauri updater lives in the desktop app; this is only its presentation state). */
export type AppUpdateView =
  | { readonly _tag: 'Available'; readonly version: string }
  | { readonly _tag: 'Checking' }
  | { readonly _tag: 'Downloading'; readonly version: string }
  | { readonly _tag: 'Failed'; readonly message: string }
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Installing'; readonly version: string }
  | { readonly _tag: 'Ready'; readonly version: string };

export type UpdatePhase = 'available' | 'downloading' | 'failed' | 'installing' | 'ready';

/** A download or install is in flight (works for row phases and lower-cased App update tags). */
export const isBusyPhase = (phase: string): boolean => phase === 'downloading' || phase === 'installing';

export type UpdateRow =
  | {
      readonly error: string | undefined;
      readonly kind: 'app';
      readonly phase: UpdatePhase;
      /** Undefined only for a `failed` row: the failed step may not know the version. */
      readonly version: string | undefined;
    }
  | {
      readonly error: string | undefined;
      readonly from: string | undefined;
      readonly id: AgentLaunchTarget;
      readonly kind: 'provider';
      readonly phase: Exclude<UpdatePhase, 'failed'>;
      readonly version: string;
    };

export type UpdatesSummary = {
  /** An App update download / install failed. */
  readonly appFailed: boolean;
  /** Pending updates (excludes a failed App row, which counts as a warning instead). */
  readonly count: number;
  /** Enabled providers whose Check for latest failed. */
  readonly failedProviders: readonly ProviderView[];
};

const providerRow = (p: ProviderView): UpdateRow | undefined => {
  const { runtime } = p;
  if (!p.enabled || runtime?.active === undefined) {
    return undefined;
  }
  const { job, latest } = runtime;
  const error = job._tag === 'Failed' ? job.message : undefined;
  const base = { error, from: runtime.active, id: p.id, kind: 'provider' } as const;
  if (job._tag === 'Downloading') {
    return { ...base, phase: 'downloading', version: job.version };
  }
  if (job._tag === 'Installing') {
    return { ...base, phase: 'installing', version: job.version };
  }
  const ready = readyToInstallVersion(p);
  if (ready !== undefined) {
    return { ...base, phase: 'ready', version: ready };
  }
  return latest._tag === 'Available' ? { ...base, phase: 'available', version: latest.version } : undefined;
};

const appRow = (app: AppUpdateView | undefined): UpdateRow | undefined => {
  switch (app?._tag) {
    case 'Available':
      return { error: undefined, kind: 'app', phase: 'available', version: app.version };
    case 'Downloading':
      return { error: undefined, kind: 'app', phase: 'downloading', version: app.version };
    case 'Ready':
      return { error: undefined, kind: 'app', phase: 'ready', version: app.version };
    case 'Installing':
      return { error: undefined, kind: 'app', phase: 'installing', version: app.version };
    case 'Failed':
      return { error: app.message, kind: 'app', phase: 'failed', version: undefined };
    case 'Checking':
    case 'Idle':
    case undefined:
      return undefined;
  }
};

export const updateRows = (providers: readonly ProviderView[], app: AppUpdateView | undefined): UpdateRow[] =>
  [appRow(app), ...providers.map(providerRow)].filter((row): row is UpdateRow => row !== undefined);

export const updatesSummary = (rows: readonly UpdateRow[], providers: readonly ProviderView[]): UpdatesSummary => ({
  appFailed: rows.some(row => row.phase === 'failed'),
  count: rows.filter(row => row.phase !== 'failed').length,
  failedProviders: providers.filter(p => p.enabled && p.runtime?.latest._tag === 'Failed'),
});
