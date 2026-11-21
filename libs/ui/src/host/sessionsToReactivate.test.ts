import { assert, describe, it } from '@effect/vitest';

import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import { CLAUDE, CODEX } from '../atoms/fakeAgent.testing.ts';
import { sessionsToReactivate } from './sessionsToReactivate.ts';

const codex = CODEX;
const claude = CLAUDE;

const snapshotWith = (sessions: Record<string, 'active' | 'activating' | 'inactive'>): BackendHarnessSnapshot =>
  ({
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([id, status]) => [id, initialSessionSnapshot(id, status)]),
    ),
  }) as unknown as BackendHarnessSnapshot;

describe('sessionsToReactivate', () => {
  it('lists active and activating sessions of every launch target, not inactive ones', () => {
    const result = sessionsToReactivate(
      [
        { launchTarget: codex, snapshot: snapshotWith({ a: 'active', b: 'inactive', c: 'activating' }) },
        { launchTarget: claude, snapshot: snapshotWith({ d: 'active' }) },
      ],
      () => false,
    );
    assert.deepStrictEqual(result, [
      { launchTarget: codex, sessionId: 'a' },
      { launchTarget: codex, sessionId: 'c' },
      { launchTarget: claude, sessionId: 'd' },
    ]);
  });

  it('drops excluded sessions', () => {
    const result = sessionsToReactivate(
      [{ launchTarget: codex, snapshot: snapshotWith({ a: 'active', child: 'active' }) }],
      target => target.sessionId === 'child',
    );
    assert.deepStrictEqual(result, [{ launchTarget: codex, sessionId: 'a' }]);
  });
});
