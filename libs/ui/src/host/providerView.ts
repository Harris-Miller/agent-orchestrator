/**
 * Provider presentation model: what Settings > Providers and the startup modal render, derived from real state
 * (enabled preference, CLI on PATH, `current.json`, harness phase). Pure — no atoms, no host services.
 */
import { PROVIDER_NPM_PACKAGES, providerDisplayPath, providerRuntimeRelativeDir } from '@lib/hoa-home';

import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { isNotSignedIn } from './harnessFailure.ts';
import type { HarnessFailure } from './harnessFailure.ts';

export type CliState =
  | { readonly _tag: 'Found'; readonly path: string }
  | { readonly _tag: 'Missing' }
  | { readonly _tag: 'NotRequired' };

/** Manual "Check for latest". Never touches the running provider. */
export type LatestCheck =
  | { readonly _tag: 'Available'; readonly version: string }
  | { readonly _tag: 'Checking' }
  | { readonly _tag: 'Failed'; readonly message: string }
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'UpToDate' };

/** Background / foreground work for one provider. Indeterminate spinner only (no percentage). */
export type RuntimeJob =
  | { readonly _tag: 'Downloading'; readonly version: string }
  | { readonly _tag: 'Failed'; readonly detail: string; readonly message: string }
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Installing'; readonly version: string }
  | { readonly _tag: 'Removing' };

/** Install / Remove swap the active runtime: the provider stops and restarts, so nothing may launch against it. */
export const isSwitchingJob = (job: RuntimeJob): boolean => job._tag === 'Installing' || job._tag === 'Removing';

/** No runtime job in flight (Idle, or Failed and awaiting a retry). */
export const isRuntimeJobIdle = (job: RuntimeJob): boolean => job._tag === 'Idle' || job._tag === 'Failed';

/** Directory whose deletion failed; retried at startup. */
export type CleanupFailure = { readonly error: string; readonly version: string };

export type RuntimeView = {
  readonly active: string | undefined;
  readonly cleanupFailures: readonly CleanupFailure[];
  /** Completed runtimes that are not active: an update ready to Install. */
  readonly downloaded: readonly string[];
  /** `current.json` unreadable/malformed — surfaced, never auto-repaired. */
  readonly documentError: string | undefined;
  readonly job: RuntimeJob;
  readonly latest: LatestCheck;
};

export type AuthState = 'Checking' | 'NotSignedIn' | 'SignedIn' | 'SigningIn' | 'Unknown';

export type ProviderView = {
  readonly auth: AuthState;
  readonly cli: CliState;
  readonly enabled: boolean;
  /** Last non-auth bootstrap error, if the harness is in `error`. */
  readonly harnessError: string | undefined;
  readonly id: AgentLaunchTarget;
  /** Live sessions of THIS instance. */
  readonly liveSessions: number;
  /** `undefined` = provider has no managed runtime (Cursor). */
  readonly runtime: RuntimeView | undefined;
};

export type CommandHint = { readonly command: string; readonly label: string };

export type ProviderMeta = {
  readonly cliInstall: readonly CommandHint[];
  readonly cliName: string | undefined;
  readonly label: string;
  /** `undefined` = no managed runtime (Cursor). */
  readonly runtime:
    | { readonly _tag: 'npm'; readonly package: string }
    | { readonly _tag: 'registry'; readonly package: string }
    | undefined;
  readonly signIn:
    | { readonly _tag: 'Cli'; readonly command: string; readonly hint: string }
    | { readonly _tag: 'InApp'; readonly hint: string };
};

export const PROVIDER_META = {
  'antigravity-acp': {
    cliInstall: [],
    cliName: undefined,
    label: 'Antigravity',
    runtime: { _tag: 'registry', package: 'agy_acp_server' },
    signIn: { _tag: 'InApp', hint: 'Sign in with Google in your browser. No CLI needed.' },
  },
  'claude-agent-acp': {
    cliInstall: [
      { command: 'curl -fsSL https://claude.ai/install.sh | bash', label: 'Native installer' },
      { command: 'brew install --cask claude-code', label: 'Homebrew' },
    ],
    cliName: 'claude',
    label: 'Claude',
    runtime: { _tag: 'npm', package: PROVIDER_NPM_PACKAGES['claude-agent-acp'] },
    signIn: { _tag: 'Cli', command: 'claude', hint: 'Run claude in a terminal, then /login and follow the prompts.' },
  },
  'codex-acp': {
    cliInstall: [
      { command: 'npm install -g @openai/codex', label: 'npm' },
      { command: 'brew install --cask codex', label: 'Homebrew' },
    ],
    cliName: 'codex',
    label: 'Codex',
    runtime: { _tag: 'npm', package: PROVIDER_NPM_PACKAGES['codex-acp'] },
    signIn: { _tag: 'Cli', command: 'codex login', hint: 'Run codex login in a terminal.' },
  },
  'cursor-acp': {
    cliInstall: [{ command: 'curl https://cursor.com/install -fsS | bash', label: 'Installer' }],
    cliName: 'cursor-agent',
    label: 'Cursor',
    runtime: undefined,
    signIn: { _tag: 'Cli', command: 'cursor-agent login', hint: 'Run cursor-agent login in a terminal.' },
  },
} as const satisfies Record<AgentLaunchTarget, ProviderMeta>;

export const runtimeDirLabel = (id: AgentLaunchTarget, version: string): string =>
  providerDisplayPath(id, providerRuntimeRelativeDir(version));

// --- Derived status ---------------------------------------------------------

export type OverallStatus =
  | 'checking'
  | 'cli-missing'
  | 'disabled'
  | 'download-failed'
  | 'downloading'
  | 'error'
  | 'needs-runtime'
  | 'not-signed-in'
  | 'ready'
  | 'signing-in'
  | 'switching';

/**
 * Disabled = switched off by the user. Unavailable (and the install/runtime states that explain it) = enabled but
 * cannot launch. The first-Download job counts as `downloading` only while there is no active runtime.
 */
export const overallStatus = (p: ProviderView): OverallStatus => {
  if (!p.enabled) {
    return 'disabled';
  }
  if (p.cli._tag === 'Missing') {
    return 'cli-missing';
  }
  const { runtime } = p;
  if (runtime !== undefined) {
    if (isSwitchingJob(runtime.job)) {
      return 'switching';
    }
    if (runtime.active === undefined) {
      switch (runtime.job._tag) {
        case 'Failed':
          return 'download-failed';
        case 'Downloading':
          return 'downloading';
        case 'Idle':
          return 'needs-runtime';
        default:
          break;
      }
    }
  }
  switch (p.auth) {
    case 'Checking':
    case 'Unknown':
      return p.harnessError === undefined ? 'checking' : 'error';
    case 'NotSignedIn':
      return 'not-signed-in';
    case 'SigningIn':
      return 'signing-in';
    case 'SignedIn':
      return 'ready';
  }
};

export type StatusTone = 'error' | 'info' | 'neutral' | 'success' | 'warning';

export type StatusMeta = {
  readonly label: string;
  /** The Startup Providers modal renders the "how to fix" help under the row (its compact matrix skips the rest). */
  readonly startupHelp: boolean;
  readonly tone: StatusTone;
  /** Present only when an enabled provider cannot launch: the reason shown beside it in pickers and the startup matrix. */
  readonly unavailable: ((p: ProviderView) => string) | undefined;
};

export const STATUS_META: Readonly<Record<OverallStatus, StatusMeta>> = {
  checking: { label: 'Checking sign-in…', startupHelp: false, tone: 'neutral', unavailable: undefined },
  'cli-missing': {
    label: 'Unavailable',
    startupHelp: true,
    tone: 'error',
    unavailable: p => `${PROVIDER_META[p.id].cliName ?? 'CLI'} not found on PATH`,
  },
  disabled: { label: 'Disabled', startupHelp: false, tone: 'neutral', unavailable: undefined },
  'download-failed': {
    label: 'Download failed',
    startupHelp: true,
    tone: 'error',
    unavailable: () => 'Runtime download failed',
  },
  downloading: { label: 'Downloading…', startupHelp: false, tone: 'info', unavailable: () => 'Downloading runtime…' },
  error: { label: 'Error', startupHelp: true, tone: 'error', unavailable: undefined },
  'needs-runtime': {
    label: 'Runtime not downloaded',
    startupHelp: false,
    tone: 'warning',
    unavailable: () => 'Runtime not downloaded',
  },
  'not-signed-in': { label: 'Not signed in', startupHelp: true, tone: 'warning', unavailable: undefined },
  ready: { label: 'Ready', startupHelp: false, tone: 'success', unavailable: undefined },
  'signing-in': { label: 'Signing in…', startupHelp: true, tone: 'info', unavailable: undefined },
  switching: { label: 'Switching runtime…', startupHelp: false, tone: 'info', unavailable: undefined },
};

/** Reason shown beside an unavailable row in pickers and the startup matrix. */
export const unavailableReason = (p: ProviderView): string | undefined =>
  STATUS_META[overallStatus(p)].unavailable?.(p);

export const statusHeadline = (p: ProviderView): string => {
  const status = overallStatus(p);
  switch (status) {
    case 'ready':
      return 'Signed in';
    case 'cli-missing':
      return `Unavailable · ${PROVIDER_META[p.id].cliName ?? 'CLI'} not found`;
    case 'error':
      return p.harnessError ?? STATUS_META.error.label;
    case 'checking':
    case 'disabled':
    case 'download-failed':
    case 'downloading':
    case 'needs-runtime':
    case 'not-signed-in':
    case 'signing-in':
    case 'switching':
      return STATUS_META[status].label;
  }
};

export const activeVersionLabel = (p: ProviderView): string | undefined =>
  p.runtime?.active === undefined ? undefined : `v${p.runtime.active}`;

/** An update that is downloaded and waiting for Install (sessions keep running meanwhile). */
export const readyToInstallVersion = (p: ProviderView): string | undefined => p.runtime?.downloaded.at(-1);

export type ProviderUpdate = { readonly id: AgentLaunchTarget; readonly version: string };

/** Enabled managed providers with an Active runtime that the background update check may query right now. */
export const providersToCheckForUpdates = (views: readonly ProviderView[]): AgentLaunchTarget[] =>
  views
    .filter(
      p =>
        p.enabled &&
        p.runtime?.active !== undefined &&
        isRuntimeJobIdle(p.runtime.job) &&
        p.runtime.latest._tag !== 'Checking',
    )
    .map(p => p.id);

/** Enabled providers with an Active runtime and a newer version known (found by a check, or downloaded awaiting Install). */
export const providerUpdates = (views: readonly ProviderView[]): ProviderUpdate[] =>
  views.flatMap((p): ProviderUpdate[] => {
    if (!p.enabled || p.runtime?.active === undefined) {
      return [];
    }
    const version = p.runtime.latest._tag === 'Available' ? p.runtime.latest.version : readyToInstallVersion(p);
    return version === undefined ? [] : [{ id: p.id, version }];
  });

/**
 * Map harness phase + published failure to the sign-in axis. Classification comes from the failure tag, not its text.
 */
export const authFromHarness = (
  phase: AcpBootstrapPhase,
  failure: HarnessFailure | undefined,
): { readonly auth: AuthState; readonly harnessError: string | undefined } => {
  switch (phase) {
    case 'usable':
    case 'ready':
      return { auth: 'SignedIn', harnessError: undefined };
    case 'signing-in':
      return { auth: 'SigningIn', harnessError: undefined };
    case 'connecting':
    case 'initialized':
      return { auth: 'Checking', harnessError: undefined };
    case 'error':
      return isNotSignedIn(failure)
        ? { auth: 'NotSignedIn', harnessError: undefined }
        : { auth: 'Unknown', harnessError: failure?.message ?? 'Backend error' };
  }
};
