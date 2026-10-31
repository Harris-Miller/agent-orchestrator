/**
 * Provider presentation model: what Settings > Providers and the startup modal render, derived from real state
 * (enabled preference, CLI on PATH, `current.json`, harness phase). Pure — no atoms, no host services.
 */
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

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

export const PROVIDER_META: Readonly<Record<AgentLaunchTarget, ProviderMeta>> = {
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
    runtime: { _tag: 'npm', package: '@agentclientprotocol/claude-agent-acp' },
    signIn: { _tag: 'Cli', command: 'claude', hint: 'Run claude in a terminal, then /login and follow the prompts.' },
  },
  'codex-acp': {
    cliInstall: [
      { command: 'npm install -g @openai/codex', label: 'npm' },
      { command: 'brew install --cask codex', label: 'Homebrew' },
    ],
    cliName: 'codex',
    label: 'Codex',
    runtime: { _tag: 'npm', package: '@agentclientprotocol/codex-acp' },
    signIn: { _tag: 'Cli', command: 'codex login', hint: 'Run codex login in a terminal.' },
  },
  'cursor-acp': {
    cliInstall: [{ command: 'curl https://cursor.com/install -fsS | bash', label: 'Installer' }],
    cliName: 'cursor-agent',
    label: 'Cursor',
    runtime: undefined,
    signIn: { _tag: 'Cli', command: 'cursor-agent login', hint: 'Run cursor-agent login in a terminal.' },
  },
};

export const runtimeDirLabel = (id: AgentLaunchTarget, version: string): string =>
  `~/.ao/providers/${id}/runtime/${version}`;

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
    if (runtime.job._tag === 'Installing' || runtime.job._tag === 'Removing') {
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

/** Enabled but cannot launch (no CLI, no active runtime, download failed). */
export const isProviderUnavailable = (p: ProviderView): boolean => {
  const status = overallStatus(p);
  return (
    status === 'cli-missing' || status === 'needs-runtime' || status === 'download-failed' || status === 'downloading'
  );
};

/** Selectable for create / handoff / Virtual: enabled, launchable, and the harness is ready. */
export const isProviderReady = (p: ProviderView): boolean => overallStatus(p) === 'ready';

export type StatusTone = 'error' | 'info' | 'neutral' | 'success' | 'warning';

export const STATUS_META: Readonly<Record<OverallStatus, { readonly label: string; readonly tone: StatusTone }>> = {
  checking: { label: 'Checking sign-in…', tone: 'neutral' },
  'cli-missing': { label: 'Unavailable', tone: 'error' },
  disabled: { label: 'Disabled', tone: 'neutral' },
  'download-failed': { label: 'Download failed', tone: 'error' },
  downloading: { label: 'Downloading…', tone: 'info' },
  error: { label: 'Error', tone: 'error' },
  'needs-runtime': { label: 'Runtime not downloaded', tone: 'warning' },
  'not-signed-in': { label: 'Not signed in', tone: 'warning' },
  ready: { label: 'Ready', tone: 'success' },
  'signing-in': { label: 'Signing in…', tone: 'info' },
  switching: { label: 'Switching runtime…', tone: 'info' },
};

/** Reason shown beside an unavailable row in pickers and the startup matrix. */
export const unavailableReason = (p: ProviderView): string | undefined => {
  switch (overallStatus(p)) {
    case 'cli-missing':
      return `${PROVIDER_META[p.id].cliName ?? 'CLI'} not found on PATH`;
    case 'needs-runtime':
      return 'Runtime not downloaded';
    case 'download-failed':
      return 'Runtime download failed';
    case 'downloading':
      return 'Downloading runtime…';
    case 'checking':
    case 'disabled':
    case 'error':
    case 'not-signed-in':
    case 'ready':
    case 'signing-in':
    case 'switching':
      return undefined;
  }
};

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

/**
 * Map harness phase + published error to the sign-in axis. `bootstrapError` is the harness `error` text; a
 * "not authenticated / not signed in" message means NotSignedIn, any other error stays an error.
 */
export const authFromHarness = (
  phase: 'connecting' | 'error' | 'initialized' | 'probing' | 'ready' | 'signing-in',
  error: string | undefined,
): { readonly auth: AuthState; readonly harnessError: string | undefined } => {
  switch (phase) {
    case 'ready':
      return { auth: 'SignedIn', harnessError: undefined };
    case 'signing-in':
      return { auth: 'SigningIn', harnessError: undefined };
    case 'connecting':
    case 'initialized':
    case 'probing':
      return { auth: 'Checking', harnessError: undefined };
    case 'error':
      return error !== undefined && /not (authenticated|signed in)|log in|sign in/i.test(error)
        ? { auth: 'NotSignedIn', harnessError: undefined }
        : { auth: 'Unknown', harnessError: error ?? 'Backend error' };
  }
};
