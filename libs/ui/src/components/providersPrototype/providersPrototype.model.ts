/**
 * PROTOTYPE (#175) — throwaway. In-memory mock of provider runtime / CLI / sign-in state.
 * Nothing here touches npm, the filesystem, or real atoms.
 */
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';

export type CliState =
  | { readonly _tag: 'Found'; readonly path: string; readonly version: string }
  | { readonly _tag: 'Missing' }
  | { readonly _tag: 'NotRequired' };

export type LatestCheck =
  | { readonly _tag: 'Available'; readonly version: string }
  | { readonly _tag: 'Checking' }
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'UpToDate' };

export type RuntimeJob =
  | { readonly _tag: 'Failed'; readonly detail: string; readonly message: string }
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Installing'; readonly progress: number; readonly version: string }
  | { readonly _tag: 'Resolving' };

export type RuntimeState = {
  readonly active: string | undefined;
  readonly installed: readonly string[];
  readonly job: RuntimeJob;
  readonly latest: LatestCheck;
};

export type AuthState = 'Checking' | 'NotSignedIn' | 'SignedIn' | 'SigningIn' | 'Unknown';

export type ProviderMock = {
  readonly auth: AuthState;
  readonly cli: CliState;
  /** User toggle. Disabled providers are hidden from pickers and skipped by probes. */
  readonly enabled: boolean;
  /** Scenario knob: next install fails with this message (cleared after one failure). */
  readonly failNextInstall: { readonly detail: string; readonly message: string } | undefined;
  readonly id: AgentLaunchTarget;
  /** Scenario knob: what the Config probe reports after the runtime is ready. */
  readonly probeResult: 'NotSignedIn' | 'SignedIn';
  /** `undefined` = provider has no managed runtime (Cursor). */
  readonly runtime: RuntimeState | undefined;
};

export type CommandHint = { readonly command: string; readonly label: string };

export type ProviderMeta = {
  readonly accountLabel: string;
  readonly cliName: string | undefined;
  readonly cliInstall: readonly CommandHint[];
  readonly label: string;
  readonly latestVersion: string | undefined;
  readonly runtimeKind: 'npm' | 'registry' | undefined;
  readonly runtimePackage: string | undefined;
  readonly signIn:
    | { readonly _tag: 'Cli'; readonly command: string; readonly hint: string }
    | { readonly _tag: 'InApp'; readonly hint: string };
};

export const PROVIDER_META: Readonly<Record<AgentLaunchTarget, ProviderMeta>> = {
  'antigravity-acp': {
    accountLabel: 'Google account',
    cliInstall: [],
    cliName: undefined,
    label: 'Antigravity',
    latestVersion: '1.5.0',
    runtimeKind: 'registry',
    runtimePackage: 'agy_acp_server',
    signIn: { _tag: 'InApp', hint: 'Sign in with Google in your browser. No CLI needed.' },
  },
  'claude-agent-acp': {
    accountLabel: 'Claude Max',
    cliInstall: [
      { command: 'curl -fsSL https://claude.ai/install.sh | bash', label: 'Native installer' },
      { command: 'brew install --cask claude-code', label: 'Homebrew' },
    ],
    cliName: 'claude',
    label: 'Claude',
    latestVersion: '0.32.0',
    runtimeKind: 'npm',
    runtimePackage: '@agentclientprotocol/claude-agent-acp',
    signIn: { _tag: 'Cli', command: 'claude', hint: 'Run claude in a terminal, then /login and follow the prompts.' },
  },
  'codex-acp': {
    accountLabel: 'ChatGPT',
    cliInstall: [
      { command: 'npm install -g @openai/codex', label: 'npm' },
      { command: 'brew install --cask codex', label: 'Homebrew' },
    ],
    cliName: 'codex',
    label: 'Codex',
    latestVersion: '0.15.1',
    runtimeKind: 'npm',
    runtimePackage: '@agentclientprotocol/codex-acp',
    signIn: { _tag: 'Cli', command: 'codex login', hint: 'Run codex login in a terminal.' },
  },
  'cursor-acp': {
    accountLabel: 'Cursor Pro',
    cliInstall: [{ command: 'curl https://cursor.com/install -fsS | bash', label: 'Installer' }],
    cliName: 'cursor-agent',
    label: 'Cursor',
    latestVersion: undefined,
    runtimeKind: undefined,
    runtimePackage: undefined,
    signIn: { _tag: 'Cli', command: 'cursor-agent login', hint: 'Run cursor-agent login in a terminal.' },
  },
};

export const runtimeDir = (id: AgentLaunchTarget, version: string): string =>
  `~/.ao/providers/${id}/runtime/${version}`;

export const runtimeActionLabel = (id: AgentLaunchTarget): string =>
  PROVIDER_META[id].runtimeKind === 'registry' ? 'Install' : 'Download';

// --- Derived status ---------------------------------------------------------

export type OverallStatus =
  | 'checking'
  | 'disabled'
  | 'install-failed'
  | 'installing'
  | 'needs-runtime'
  | 'not-signed-in'
  | 'ready'
  | 'signing-in'
  | 'unavailable';

export const overallStatus = (p: ProviderMock): OverallStatus => {
  if (!p.enabled) {
    return 'disabled';
  }
  if (p.cli._tag === 'Missing') {
    return 'unavailable';
  }
  if (p.runtime !== undefined && p.runtime.active === undefined) {
    switch (p.runtime.job._tag) {
      case 'Failed':
        return 'install-failed';
      case 'Installing':
      case 'Resolving':
        return 'installing';
      case 'Idle':
        return 'needs-runtime';
    }
  }
  switch (p.auth) {
    case 'Checking':
    case 'Unknown':
      return 'checking';
    case 'NotSignedIn':
      return 'not-signed-in';
    case 'SigningIn':
      return 'signing-in';
    case 'SignedIn':
      return 'ready';
  }
};

export type StatusTone = 'error' | 'info' | 'neutral' | 'success' | 'warning';

export const STATUS_META: Readonly<Record<OverallStatus, { readonly label: string; readonly tone: StatusTone }>> = {
  checking: { label: 'Checking sign-in…', tone: 'neutral' },
  disabled: { label: 'Disabled', tone: 'neutral' },
  'install-failed': { label: 'Install failed', tone: 'error' },
  installing: { label: 'Installing…', tone: 'info' },
  'needs-runtime': { label: 'Runtime not installed', tone: 'warning' },
  'not-signed-in': { label: 'Not signed in', tone: 'warning' },
  ready: { label: 'Ready', tone: 'success' },
  'signing-in': { label: 'Signing in…', tone: 'info' },
  unavailable: { label: 'Unavailable', tone: 'error' },
};

/** One-line headline à la T3Code: "Ready · Claude Max", "Unavailable · claude not found". */
export const statusHeadline = (p: ProviderMock): string => {
  const status = overallStatus(p);
  const meta = PROVIDER_META[p.id];
  switch (status) {
    case 'ready':
      return `Signed in · ${meta.accountLabel}`;
    case 'unavailable':
      return `Unavailable · ${meta.cliName ?? 'CLI'} not found`;
    case 'installing':
      return p.runtime?.job._tag === 'Installing' ? `Installing v${p.runtime.job.version}…` : 'Resolving latest…';
    case 'checking':
    case 'disabled':
    case 'install-failed':
    case 'needs-runtime':
    case 'not-signed-in':
    case 'signing-in':
      return STATUS_META[status].label;
  }
};

export const activeVersionLabel = (p: ProviderMock): string | undefined => {
  if (p.runtime !== undefined) {
    return p.runtime.active === undefined ? undefined : `v${p.runtime.active}`;
  }
  return p.cli._tag === 'Found' ? `v${p.cli.version}` : undefined;
};

// --- Scenarios --------------------------------------------------------------

const idleRuntime = (
  installed: readonly string[] = [],
  active: string | undefined = installed.at(-1),
): RuntimeState => ({
  active,
  installed,
  job: { _tag: 'Idle' },
  latest: { _tag: 'Idle' },
});

const found = (path: string, version: string): CliState => ({ _tag: 'Found', path, version });

const base = (id: AgentLaunchTarget, overrides: Partial<ProviderMock>): ProviderMock => ({
  auth: 'Unknown',
  cli: { _tag: 'Missing' },
  enabled: true,
  failNextInstall: undefined,
  id,
  probeResult: 'SignedIn',
  runtime: undefined,
  ...overrides,
});

/**
 * `seeded: false` = first launch: every toggle starts off; first-run defaults are applied once the
 * Node prerequisite passes (Claude/Codex on iff their CLI is found, Antigravity/Cursor always off).
 */
export const SCENARIOS = {
  fresh: {
    build: (): readonly ProviderMock[] => [
      base('claude-agent-acp', {
        cli: found('/opt/homebrew/bin/claude', '2.1.309'),
        enabled: false,
        runtime: idleRuntime(),
      }),
      base('codex-acp', { enabled: false, probeResult: 'NotSignedIn', runtime: idleRuntime() }),
      base('antigravity-acp', {
        cli: { _tag: 'NotRequired' },
        enabled: false,
        probeResult: 'NotSignedIn',
        runtime: idleRuntime(),
      }),
      base('cursor-acp', { enabled: false }),
    ],
    label: 'Fresh install (first launch)',
    seeded: false,
  },
  mixed: {
    build: (): readonly ProviderMock[] => [
      base('claude-agent-acp', {
        auth: 'SignedIn',
        cli: found('/opt/homebrew/bin/claude', '2.1.309'),
        runtime: idleRuntime(['0.31.0']),
      }),
      base('codex-acp', {
        auth: 'NotSignedIn',
        cli: found('/opt/homebrew/bin/codex', '0.166.0'),
        runtime: idleRuntime(['0.14.2']),
      }),
      base('antigravity-acp', { auth: 'NotSignedIn', cli: { _tag: 'NotRequired' }, runtime: idleRuntime(['1.4.1']) }),
      base('cursor-acp', { cli: found('~/.local/bin/cursor-agent', '2026.10.02'), enabled: false }),
    ],
    label: 'Mixed',
    seeded: true,
  },
  ready: {
    build: (): readonly ProviderMock[] => [
      base('claude-agent-acp', {
        auth: 'SignedIn',
        cli: found('/opt/homebrew/bin/claude', '2.1.309'),
        runtime: idleRuntime(['0.30.4', '0.31.0']),
      }),
      base('codex-acp', {
        auth: 'SignedIn',
        cli: found('/opt/homebrew/bin/codex', '0.166.0'),
        runtime: idleRuntime(['0.15.1']),
      }),
      base('antigravity-acp', { auth: 'SignedIn', cli: { _tag: 'NotRequired' }, runtime: idleRuntime(['1.4.1']) }),
      base('cursor-acp', { auth: 'SignedIn', cli: found('~/.local/bin/cursor-agent', '2026.10.02') }),
    ],
    label: 'All ready',
    seeded: true,
  },
  failures: {
    build: (): readonly ProviderMock[] => [
      // Claude defaulted off at first run (no CLI); user turned it on to see what's missing.
      base('claude-agent-acp', { runtime: idleRuntime() }),
      base('codex-acp', {
        cli: found('/opt/homebrew/bin/codex', '0.166.0'),
        runtime: {
          ...idleRuntime(),
          job: {
            _tag: 'Failed',
            detail:
              'npm error code ETIMEDOUT\nnpm error network request to https://registry.npmjs.org/@agentclientprotocol%2fcodex-acp failed',
            message: 'npm could not reach the registry.',
          },
        },
      }),
      base('antigravity-acp', {
        cli: { _tag: 'NotRequired' },
        failNextInstall: {
          detail:
            'expected sha256 9f2c…a41e\nactual   sha256 03bd…77c0\narchive  agy_acp_server-1.5.0-darwin-arm64.tar.gz',
          message: 'Downloaded archive failed integrity check (sha256 mismatch).',
        },
        runtime: idleRuntime(),
      }),
      base('cursor-acp', {}),
    ],
    label: 'Failures',
    seeded: true,
  },
} as const;

export type ScenarioId = keyof typeof SCENARIOS;

export const SCENARIO_IDS = Object.keys(SCENARIOS) as readonly ScenarioId[];

/** First-run toggle defaults: Claude/Codex follow CLI detection; beta providers always start off. */
export const firstRunEnabled = (p: ProviderMock): boolean => {
  switch (p.id) {
    case 'claude-agent-acp':
    case 'codex-acp':
      return p.cli._tag === 'Found';
    case 'antigravity-acp':
    case 'cursor-acp':
      return false;
  }
};

export const isScenarioId = (value: string | null): value is ScenarioId =>
  value !== null && Object.hasOwn(SCENARIOS, value);
