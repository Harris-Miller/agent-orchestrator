import { assert, describe, it } from '@effect/vitest';

import {
  authFromHarness,
  isProviderReady,
  isProviderUnavailable,
  overallStatus,
  readyToInstallVersion,
  unavailableReason,
} from './providerView.ts';
import type { ProviderView, RuntimeView } from './providerView.ts';

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
    assert.isTrue(isProviderUnavailable(missingCli));
    assert.strictEqual(unavailableReason(missingCli), 'claude not found on PATH');
  });

  it('an enabled provider without an active runtime is unavailable, not disabled', () => {
    const noRuntime = view({ runtime: runtime({ active: undefined }) });
    assert.strictEqual(overallStatus(noRuntime), 'needs-runtime');
    assert.isTrue(isProviderUnavailable(noRuntime));
    assert.isFalse(isProviderReady(noRuntime));
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
    assert.isTrue(isProviderReady(updating));
    const ready = view({ runtime: runtime({ downloaded: ['2.0.0'] }) });
    assert.isTrue(isProviderReady(ready));
    assert.strictEqual(readyToInstallVersion(ready), '2.0.0');
    const switching = view({ runtime: runtime({ job: { _tag: 'Installing', version: '2.0.0' } }) });
    assert.strictEqual(overallStatus(switching), 'switching');
    assert.isFalse(isProviderReady(switching));
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
