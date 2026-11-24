/** Updates indicator presentation model: pending Provider and App updates as rows. Pure, no atoms or host services. */
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { readyToInstallVersion } from './providerView.ts';
import type { ProviderView } from './providerView.ts';

/** Desktop app update lifecycle (the Tauri updater lives in the desktop app; this is only its presentation state). */
export type AppUpdateView =
  | { readonly _tag: 'Available'; readonly version: string }
  | { readonly _tag: 'Downloading'; readonly version: string }
  | { readonly _tag: 'Failed'; readonly message: string }
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Installing'; readonly version: string }
  | { readonly _tag: 'Ready'; readonly version: string };

export type UpdatePhase = 'available' | 'downloading' | 'installing' | 'ready';

export type UpdateRow =
  | { readonly kind: 'app'; readonly phase: UpdatePhase; readonly version: string }
  | {
      readonly from: string | undefined;
      readonly id: AgentLaunchTarget;
      readonly kind: 'provider';
      readonly phase: UpdatePhase;
      readonly version: string;
    };

export type UpdatesSummary = { readonly busy: boolean; readonly checkFailed: boolean; readonly count: number };

const providerRow = (p: ProviderView): UpdateRow | undefined => {
  if (!p.enabled || p.runtime?.active === undefined) {
    return undefined;
  }
  const { job, latest } = p.runtime;
  const base = { from: p.runtime.active, id: p.id, kind: 'provider' } as const;
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
      return { kind: 'app', phase: 'available', version: app.version };
    case 'Downloading':
      return { kind: 'app', phase: 'downloading', version: app.version };
    case 'Ready':
      return { kind: 'app', phase: 'ready', version: app.version };
    case 'Installing':
      return { kind: 'app', phase: 'installing', version: app.version };
    case 'Failed':
    case 'Idle':
    case undefined:
      return undefined;
  }
};

export const updateRows = (providers: readonly ProviderView[], app: AppUpdateView | undefined): UpdateRow[] =>
  [appRow(app), ...providers.map(providerRow)].filter((row): row is UpdateRow => row !== undefined);

export const updatesSummary = (rows: readonly UpdateRow[], providers: readonly ProviderView[]): UpdatesSummary => ({
  busy: rows.some(row => row.phase === 'downloading' || row.phase === 'installing'),
  checkFailed: providers.some(p => p.enabled && p.runtime?.latest._tag === 'Failed'),
  count: rows.length,
});
