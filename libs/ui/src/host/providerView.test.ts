import { assert, describe, it } from '@effect/vitest';

import {
  authFromHarness,
  isSwitchingJob,
  overallStatus,
  providersToCheckForUpdates,
  providerUpdates,
  readyToInstallVersion,
  STATUS_META,
  unavailableReason,
} from './providerView.ts';
import type { OverallStatus, ProviderView, RuntimeView } from './providerView.ts';

const runtime = (overrides: Partial<RuntimeView> = {}): RuntimeView => ({
  active: '1.0.0',
  cleanupFailures: [],
  documentError: undefined,
  downloaded: [],
  job: { _tag: 'Idle' },
  latest: { _tag: 'Idle' },
  ...overrides,
});

const view = (overrides: Partial<ProviderView> = {}): ProviderView => ({
  auth: 'SignedIn',
  cli: { _tag: 'Found', path: '/usr/bin/claude' },
  enabled: true,
  harnessError: undefined,
  id: 'claude-agent-acp',
  liveSessions: 0,
  runtime: runtime(),
  ...overrides,
});

describe('provider status', () => {
  it('distinguishes disabled from unavailable', () => {
    assert.strictEqual(overallStatus(view({ enabled: false, cli: { _tag: 'Missing' } })), 'disabled');
    const missingCli = view({ cli: { _tag: 'Missing' } });
    assert.strictEqual(overallStatus(missingCli), 'cli-missing');
    assert.strictEqual(unavailableReason(missingCli), 'claude not found on PATH');
  });

  it('an enabled provider without an active runtime is unavailable, not disabled', () => {
    const noRuntime = view({ runtime: runtime({ active: undefined }) });
    assert.strictEqual(overallStatus(noRuntime), 'needs-runtime');
    assert.isDefined(unavailableReason(noRuntime));
  });

  it('a first Download is downloading; failures are download-failed', () => {
    const first = view({ runtime: runtime({ active: undefined, job: { _tag: 'Downloading', version: '1.0.0' } }) });
    assert.strictEqual(overallStatus(first), 'downloading');
    const failed = view({
      runtime: runtime({ active: undefined, job: { _tag: 'Failed', detail: 'x', message: 'y' } }),
    });
    assert.strictEqual(overallStatus(failed), 'download-failed');
  });

  it('an update Download while a runtime is active does not change readiness; Install shows switching', () => {
    const updating = view({ runtime: runtime({ job: { _tag: 'Downloading', version: '2.0.0' } }) });
    assert.strictEqual(overallStatus(updating), 'ready');
    const ready = view({ runtime: runtime({ downloaded: ['2.0.0'] }) });
    assert.strictEqual(overallStatus(ready), 'ready');
    assert.strictEqual(readyToInstallVersion(ready), '2.0.0');
    const switching = view({ runtime: runtime({ job: { _tag: 'Installing', version: '2.0.0' } }) });
    assert.strictEqual(overallStatus(switching), 'switching');
  });

  it('maps real harness phases from the failure tag, not its wording', () => {
    assert.deepStrictEqual(authFromHarness('connecting', undefined), { auth: 'Checking', harnessError: undefined });
    assert.deepStrictEqual(authFromHarness('initialized', undefined), { auth: 'Checking', harnessError: undefined });
    assert.deepStrictEqual(authFromHarness('signing-in', undefined), { auth: 'SigningIn', harnessError: undefined });
    assert.deepStrictEqual(authFromHarness('usable', undefined), { auth: 'SignedIn', harnessError: undefined });
    assert.deepStrictEqual(authFromHarness('ready', undefined), { auth: 'SignedIn', harnessError: undefined });
    // The tag decides, so instruction wording can change freely...
    assert.deepStrictEqual(authFromHarness('error', { _tag: 'NotSignedIn', message: 'lorem ipsum' }), {
      auth: 'NotSignedIn',
      harnessError: undefined,
    });
    // ...and sign-in wording on an ordinary failure stays an error.
    assert.deepStrictEqual(
      authFromHarness('error', { _tag: 'Failed', message: '`codex` is not authenticated — run `codex login`' }),
      { auth: 'Unknown', harnessError: '`codex` is not authenticated — run `codex login`' },
    );
    assert.deepStrictEqual(authFromHarness('error', undefined), { auth: 'Unknown', harnessError: 'Backend error' });
    const ordinary = authFromHarness('error', { _tag: 'Failed', message: 'spawn node ENOENT' });
    assert.deepStrictEqual(ordinary, { auth: 'Unknown', harnessError: 'spawn node ENOENT' });
    assert.strictEqual(overallStatus(view({ auth: ordinary.auth, harnessError: ordinary.harnessError })), 'error');
  });
});

const noRuntime = { active: undefined } as const;

/** One view per status, so a new status fails the type check here until it is covered. */
const VIEW_BY_STATUS: Readonly<Record<OverallStatus, ProviderView>> = {
  checking: view({ auth: 'Checking' }),
  'cli-missing': view({ cli: { _tag: 'Missing' } }),
  disabled: view({ enabled: false }),
  'download-failed': view({
    runtime: runtime({ ...noRuntime, job: { _tag: 'Failed', detail: 'boom', message: 'boom' } }),
  }),
  downloading: view({ runtime: runtime({ ...noRuntime, job: { _tag: 'Downloading', version: '1.0.0' } }) }),
  error: view({ auth: 'Unknown', harnessError: 'spawn node ENOENT' }),
  'needs-runtime': view({ runtime: runtime(noRuntime) }),
  'not-signed-in': view({ auth: 'NotSignedIn' }),
  ready: view(),
  'signing-in': view({ auth: 'SigningIn' }),
  switching: view({ runtime: runtime({ job: { _tag: 'Removing' } }) }),
};

describe('per-status decisions', () => {
  const entries = Object.entries(VIEW_BY_STATUS);

  it('builds each view into its own status', () => {
    for (const [status, provider] of entries) {
      assert.strictEqual(overallStatus(provider), status);
    }
  });

  it('is unavailable exactly when there is a reason', () => {
    const unavailable = entries
      .filter(([, provider]) => unavailableReason(provider) !== undefined)
      .map(([status]) => status);
    assert.deepStrictEqual(unavailable.toSorted(), ['cli-missing', 'download-failed', 'downloading', 'needs-runtime']);
  });

  it('shows startup help only where the row needs more than its action', () => {
    const withHelp = entries
      .filter(([, provider]) => STATUS_META[overallStatus(provider)].startupHelp)
      .map(([status]) => status);
    assert.deepStrictEqual(withHelp.toSorted(), [
      'cli-missing',
      'download-failed',
      'error',
      'not-signed-in',
      'signing-in',
    ]);
  });

  it('treats Installing and Removing as switching runtimes', () => {
    assert.isTrue(isSwitchingJob({ _tag: 'Installing', version: '2.0.0' }));
    assert.isTrue(isSwitchingJob({ _tag: 'Removing' }));
    assert.isFalse(isSwitchingJob({ _tag: 'Idle' }));
    assert.isFalse(isSwitchingJob({ _tag: 'Downloading', version: '2.0.0' }));
    assert.isFalse(isSwitchingJob({ _tag: 'Failed', detail: 'boom', message: 'boom' }));
  });
});

describe('provider updates', () => {
  it('reports Available and downloaded versions, skipping disabled and runtime-less providers', () => {
    const views = [
      view({ runtime: runtime({ latest: { _tag: 'Available', version: '2.0.0' } }) }),
      view({ id: 'codex-acp', runtime: runtime({ downloaded: ['0.5.0'] }) }),
      view({ id: 'antigravity-acp', enabled: false, runtime: runtime({ downloaded: ['9.0.0'] }) }),
      view({ id: 'cursor-acp', runtime: undefined }),
      view({ id: 'codex-acp', runtime: runtime({ active: undefined, downloaded: ['1.0.0'] }) }),
      view({ id: 'claude-agent-acp', runtime: runtime({ latest: { _tag: 'UpToDate' } }) }),
    ];
    assert.deepStrictEqual(providerUpdates(views), [
      { id: 'claude-agent-acp', version: '2.0.0' },
      { id: 'codex-acp', version: '0.5.0' },
    ]);
  });

  it('checks only enabled, idle, active-runtime providers that are not already checking', () => {
    const views = [
      view(),
      view({ id: 'codex-acp', runtime: runtime({ latest: { _tag: 'Checking' } }) }),
      view({ id: 'antigravity-acp', runtime: runtime({ job: { _tag: 'Installing', version: '1' } }) }),
      view({ id: 'cursor-acp', runtime: undefined }),
    ];
    assert.deepStrictEqual(providersToCheckForUpdates(views), ['claude-agent-acp']);
  });
});
