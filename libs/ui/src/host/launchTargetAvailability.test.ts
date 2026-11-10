import { assert, describe, it } from '@effect/vitest';

import type { HarnessFailure } from './harnessFailure.ts';
import type { ProviderView } from './providerView.ts';
import { harnessUnavailableReason, withProviderReasons } from './launchTargetAvailability.ts';

describe('harnessUnavailableReason', () => {
  const base = { failure: undefined, hasConfigIndex: true } as const;

  it('is undefined for a usable or ready harness with a Config option index', () => {
    assert.isUndefined(harnessUnavailableReason({ ...base, phase: 'usable' }));
    assert.isUndefined(harnessUnavailableReason({ ...base, phase: 'ready' }));
  });

  it('reports the failure message on error, else Unavailable', () => {
    const failure: HarnessFailure = { _tag: 'Failed', message: 'boom' };
    assert.strictEqual(harnessUnavailableReason({ ...base, failure, phase: 'error' }), 'boom');
    assert.strictEqual(harnessUnavailableReason({ ...base, phase: 'error' }), 'Unavailable');
  });

  it('is Starting… before usable, whatever the Config option index holds', () => {
    for (const phase of ['connecting', 'initialized', 'signing-in'] as const) {
      assert.strictEqual(harnessUnavailableReason({ ...base, hasConfigIndex: false, phase }), 'Starting…');
    }
  });

  it('tells apart a usable harness still loading models from a ready one with none', () => {
    assert.strictEqual(
      harnessUnavailableReason({ ...base, hasConfigIndex: false, phase: 'usable' }),
      'Loading models…',
    );
    assert.strictEqual(
      harnessUnavailableReason({ ...base, hasConfigIndex: false, phase: 'ready' }),
      'No configuration available',
    );
  });
});

describe('withProviderReasons', () => {
  const provider = (overrides: Partial<ProviderView>): ProviderView => ({
    auth: 'SignedIn',
    cli: { _tag: 'Found', path: '/usr/bin/agent' },
    enabled: true,
    harnessError: undefined,
    id: 'claude-agent-acp',
    liveSessions: 0,
    runtime: undefined,
    ...overrides,
  });
  const missingCli = provider({ cli: { _tag: 'Missing' }, id: 'claude-agent-acp' });
  const fine = provider({ id: 'codex-acp' });

  it("lets a Provider's own reason win over the harness's and keeps the rest", () => {
    const merged = withProviderReasons({ 'claude-agent-acp': 'Starting…', 'codex-acp': 'Loading models…' }, [
      missingCli,
      fine,
    ]);
    assert.strictEqual(merged['claude-agent-acp'], 'claude not found on PATH');
    assert.strictEqual(merged['codex-acp'], 'Loading models…');
  });

  it('adds nothing for a Provider that can launch, and does not mutate its input', () => {
    const harness = { 'claude-agent-acp': 'Starting…' } as const;
    assert.deepStrictEqual(withProviderReasons(harness, [provider({})]), harness);
    withProviderReasons(harness, [missingCli]);
    assert.deepStrictEqual(harness, { 'claude-agent-acp': 'Starting…' });
  });
});
