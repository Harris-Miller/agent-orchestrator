import { assert, describe, it } from '@effect/vitest';

import type { ProviderView, RuntimeView } from './providerView.ts';
import { updateRows, updatesSummary } from './updatesView.ts';

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

describe('updateRows', () => {
  it('is empty when nothing is newer', () => {
    assert.deepStrictEqual(updateRows([view()], { _tag: 'Idle' }), []);
  });

  it('lists an Available latest as an available row with the active version as "from"', () => {
    const rows = updateRows(
      [view({ runtime: runtime({ latest: { _tag: 'Available', version: '1.1.0' } }) })],
      undefined,
    );
    assert.deepStrictEqual(rows, [
      { from: '1.0.0', id: 'claude-agent-acp', kind: 'provider', phase: 'available', version: '1.1.0' },
    ]);
  });

  it('lists a downloaded version as ready to install, ahead of an Available latest', () => {
    const rows = updateRows(
      [view({ runtime: runtime({ downloaded: ['1.1.0'], latest: { _tag: 'Available', version: '1.2.0' } }) })],
      undefined,
    );
    assert.strictEqual(rows[0]?.phase, 'ready');
    assert.strictEqual(rows[0]?.version, '1.1.0');
  });

  it('keeps a busy row while a job runs even when latest is no longer Available', () => {
    const rows = updateRows(
      [view({ runtime: runtime({ job: { _tag: 'Downloading', version: '1.1.0' } }) })],
      undefined,
    );
    assert.strictEqual(rows[0]?.phase, 'downloading');
    const installing = updateRows(
      [view({ runtime: runtime({ job: { _tag: 'Installing', version: '1.1.0' } }) })],
      undefined,
    );
    assert.strictEqual(installing[0]?.phase, 'installing');
  });

  it('skips disabled providers and providers without an active runtime', () => {
    const latest = { _tag: 'Available', version: '2.0.0' } as const;
    assert.deepStrictEqual(
      updateRows(
        [
          view({ enabled: false, runtime: runtime({ latest }) }),
          view({ id: 'codex-acp', runtime: runtime({ active: undefined, latest }) }),
          view({ id: 'cursor-acp', runtime: undefined }),
        ],
        undefined,
      ),
      [],
    );
  });

  it('adds an app row for every non-idle, non-failed app state', () => {
    assert.deepStrictEqual(updateRows([], { _tag: 'Available', version: '2.0.0' }), [
      { kind: 'app', phase: 'available', version: '2.0.0' },
    ]);
    assert.strictEqual(updateRows([], { _tag: 'Downloading', version: '2' })[0]?.phase, 'downloading');
    assert.strictEqual(updateRows([], { _tag: 'Ready', version: '2' })[0]?.phase, 'ready');
    assert.strictEqual(updateRows([], { _tag: 'Installing', version: '2' })[0]?.phase, 'installing');
    assert.deepStrictEqual(updateRows([], { _tag: 'Failed', message: 'x' }), []);
  });
});

describe('updatesSummary', () => {
  it('counts rows, flags busy, and flags failed latest checks', () => {
    const providers = [
      view({ runtime: runtime({ latest: { _tag: 'Available', version: '1.1.0' } }) }),
      view({ id: 'codex-acp', runtime: runtime({ latest: { _tag: 'Failed', message: 'offline' } }) }),
    ];
    const rows = updateRows(providers, undefined);
    assert.deepStrictEqual(updatesSummary(rows, providers), { busy: false, checkFailed: true, count: 1 });
    const busy = updateRows([], { _tag: 'Downloading', version: '2' });
    assert.deepStrictEqual(updatesSummary(busy, []), { busy: true, checkFailed: false, count: 1 });
  });
});
