/** The single writer settles Pending interactions: answered at most once; one that leaves the snapshot unanswered (shown or waiting) is cancelled. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { initialSpawnedSubagentSnapshot, initialSubagentSnapshot } from '../host/subagent.ts';
import { markSessionInactive, raisePermission, reconcileConnectionLost } from '../host/harnessStateTransitions.ts';
import { pendingPermission } from '../host/pendingInteractions.ts';
import type { PendingPermission } from '../host/pendingInteractions.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { CLAUDE, CODEX, freshRegistry } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';

const setup = Effect.fnUntraced(function* () {
  const registry = yield* freshRegistry;
  const resolved: unknown[] = [];
  const pending = pendingPermission({
    request: {} as PendingPermission['request'],
    resolve: response => {
      resolved.push(response);
    },
    sessionId: 's1',
  });
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessions: { s1: { ...initialSessionSnapshot('s1', 'active'), pendingPermission: pending } },
  }));
  return { pending, registry, resolved };
});

describe('Pending interactions in the Backend harness snapshot', () => {
  it.effect('one dropped unanswered is cancelled, exactly once', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      updateHarnessSnapshot(s.registry, CODEX, current => markSessionInactive(current, 's1'));
      updateHarnessSnapshot(s.registry, CODEX, current => markSessionInactive(current, 's1'));
      assert.deepStrictEqual(s.resolved, [{ outcome: { outcome: 'cancelled' } }]);
    }).pipe(Effect.scoped),
  );

  it.effect('one answered and then cleared is never resolved again', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.pending.resolve({ outcome: { optionId: 'allow', outcome: 'selected' } });
      updateHarnessSnapshot(s.registry, CODEX, current => markSessionInactive(current, 's1'));
      assert.deepStrictEqual(s.resolved, [{ outcome: { optionId: 'allow', outcome: 'selected' } }]);
    }).pipe(Effect.scoped),
  );

  it.effect('one moved from a stray root entry onto its Subagent session stays open', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      updateHarnessSnapshot(s.registry, CODEX, current => {
        const { s1: stray, ...sessions } = current.sessions;
        return { ...current, sessions, subagents: { s1: initialSubagentSnapshot('s1', 'p1', stray) } };
      });
      assert.deepStrictEqual(s.resolved, []);
      assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CODEX)).subagents.s1?.pendingPermission, s.pending);
    }).pipe(Effect.scoped),
  );

  it.effect('one raised while another is shown waits, and both are cancelled when their Session is deactivated', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const newer = pendingPermission({
        request: s.pending.request,
        resolve: response => {
          s.resolved.push(['newer', response]);
        },
        sessionId: 's1',
      });
      updateHarnessSnapshot(s.registry, CODEX, current => raisePermission(current, newer));
      assert.deepStrictEqual(s.resolved, []);
      const session = s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.s1;
      assert.strictEqual(session.pendingPermission, s.pending);
      assert.deepStrictEqual(session.waitingPermissions, [newer]);
      updateHarnessSnapshot(s.registry, CODEX, current => markSessionInactive(current, 's1'));
      assert.deepStrictEqual(s.resolved, [
        { outcome: { outcome: 'cancelled' } },
        ['newer', { outcome: { outcome: 'cancelled' } }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect('a Spawned subagent mirror keeps the child root pending through the parent target Connection lost', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      updateHarnessSnapshot(s.registry, CODEX, current => ({
        ...current,
        sessions: {},
        subagents: {
          child: { ...initialSpawnedSubagentSnapshot('child', 'p1', CLAUDE), pendingPermission: s.pending },
        },
      }));
      updateHarnessSnapshot(s.registry, CODEX, reconcileConnectionLost);
      assert.deepStrictEqual(s.resolved, []);
    }).pipe(Effect.scoped),
  );
});
