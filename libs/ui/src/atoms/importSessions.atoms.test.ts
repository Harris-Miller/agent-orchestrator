/** Import: pages every usable launch target, merges rows, and confirms a row into a Tracked session. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { advertise, CLAUDE, CODEX, connectFakeAgent, enableProviders, freshRegistry } from './fakeAgent.testing.ts';
import { createImportSessionsAtoms, importRowsAtom, importStateAtom } from './importSessions.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

type Page = { readonly nextCursor?: string; readonly sessions: readonly Record<string, unknown>[] } | 'fail';

const row = (sessionId: string, lastPromptAt: string, extra: Record<string, unknown> = {}) => ({
  _meta: { jetbrains: { air: { lastPromptAt } } },
  cwd: '/proj',
  sessionId,
  ...extra,
});

/** Agent serving `pages` by cursor ('' = first) and answering `session/load` (or failing it). */
const pagedAgent = (pages: Record<string, Page>, loads: string[], failLoad = false) => ({
  agent: {
    'session/list': (request: { cursor?: string }) => {
      const page = pages[request.cursor ?? ''];
      return page === 'fail' ? Effect.fail('list-fail') : Effect.succeed(page);
    },
    'session/load': ({ sessionId }: { sessionId: string }) => {
      loads.push(sessionId);
      return failLoad ? Effect.fail('load-fail') : Effect.succeed({ configOptions: [] });
    },
  },
});

const setup = Effect.fnUntraced(function* () {
  const registry = yield* freshRegistry;
  enableProviders(registry, [CLAUDE, CODEX]);
  const runtime = createHostRuntime(mockHostLayer);
  const { cancelPromptAtomFn } = createChatAtoms(runtime);
  const lifecycle = createSessionLifecycleAtoms(runtime, cancelPromptAtomFn, () => Effect.void);
  const atoms = createImportSessionsAtoms(runtime, lifecycle.activateSessionAtomFn);
  const ids = () => registry.get(importRowsAtom).map(entry => `${entry.launchTarget}:${entry.sessionId}`);
  return { atoms, ids, registry };
});

describe('Import paging', () => {
  it.effect('merges one cursor per launch target, newest Last prompt time first, paging on demand', () =>
    Effect.gen(function* () {
      const { atoms, ids, registry } = yield* setup();
      yield* connectFakeAgent(
        CODEX,
        pagedAgent(
          {
            '': { nextCursor: 'c1', sessions: [row('x1', '2026-01-01T00:00:00Z')] },
            c1: { sessions: [row('x2', '2026-01-04T00:00:00Z')] },
          },
          [],
        ),
      );
      yield* connectFakeAgent(CLAUDE, pagedAgent({ '': { sessions: [row('y1', '2026-01-02T00:00:00Z')] } }, []));
      advertise(registry, CODEX, {});
      advertise(registry, CLAUDE, {});

      yield* runAtomFn(registry, atoms.openImportAtomFn, '/proj');
      assert.deepStrictEqual(ids(), [`${CLAUDE}:y1`, `${CODEX}:x1`]);

      yield* runAtomFn(registry, atoms.importLoadMoreAtomFn, undefined);
      assert.deepStrictEqual(ids(), [`${CODEX}:x2`, `${CLAUDE}:y1`, `${CODEX}:x1`]);
      assert.strictEqual(registry.get(importStateAtom).targets[CODEX].status, 'done');
    }).pipe(Effect.scoped),
  );

  it.effect('a failing target shows its own error while the other keeps paging; Retry recovers it', () =>
    Effect.gen(function* () {
      const { atoms, ids, registry } = yield* setup();
      const codexPages: Record<string, Page> = { '': 'fail' };
      yield* connectFakeAgent(CODEX, pagedAgent(codexPages, []));
      yield* connectFakeAgent(CLAUDE, pagedAgent({ '': { sessions: [row('y1', '2026-01-02T00:00:00Z')] } }, []));
      advertise(registry, CODEX, {});
      advertise(registry, CLAUDE, {});

      yield* runAtomFn(registry, atoms.openImportAtomFn, '/proj');
      assert.strictEqual(registry.get(importStateAtom).targets[CODEX].status, 'error');
      assert.strictEqual(registry.get(importStateAtom).targets[CLAUDE].status, 'done');
      assert.deepStrictEqual(ids(), [`${CLAUDE}:y1`]);

      codexPages[''] = { sessions: [row('x1', '2026-01-03T00:00:00Z')] };
      yield* runAtomFn(registry, atoms.importRetryTargetAtomFn, CODEX);
      assert.deepStrictEqual(ids(), [`${CODEX}:x1`, `${CLAUDE}:y1`]);
    }).pipe(Effect.scoped),
  );

  it.effect('hides rows that are already tracked, archived ones included', () =>
    Effect.gen(function* () {
      const { atoms, ids, registry } = yield* setup();
      yield* connectFakeAgent(
        CODEX,
        pagedAgent({ '': { sessions: [row('a', '2026-01-01T00:00:00Z'), row('b', '2026-01-02T00:00:00Z')] } }, []),
      );
      advertise(registry, CODEX, {});
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [{ _meta: { jetbrains: { air: { archived: true } } }, cwd: '/proj', sessionId: 'a' }],
      }));

      yield* runAtomFn(registry, atoms.openImportAtomFn, '/proj');
      assert.deepStrictEqual(ids(), [`${CODEX}:b`]);
    }).pipe(Effect.scoped),
  );
});

describe('Import confirm', () => {
  it.effect('loads the session, tracks it and Selects it', () =>
    Effect.gen(function* () {
      const { atoms, ids, registry } = yield* setup();
      const loads: string[] = [];
      yield* connectFakeAgent(
        CODEX,
        pagedAgent({ '': { sessions: [row('a', '2026-01-01T00:00:00Z', { title: 'Imported' })] } }, loads),
      );
      advertise(registry, CODEX, {});
      yield* runAtomFn(registry, atoms.openImportAtomFn, '/proj');

      yield* runAtomFn(registry, atoms.importSessionAtomFn, { launchTarget: CODEX, sessionId: 'a' });

      assert.deepStrictEqual(loads, ['a']);
      const snapshot = registry.get(backendHarnessSnapshotAtom(CODEX));
      assert.deepStrictEqual(
        snapshot.sessionHistory.map(entry => [entry.sessionId, entry.title]),
        [['a', 'Imported']],
      );
      assert.strictEqual(snapshot.sessions.a.status, 'active');
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'a' });
      assert.deepStrictEqual(ids(), []);
    }).pipe(Effect.scoped),
  );

  it.effect('a failing session/load tracks nothing and shows an error', () =>
    Effect.gen(function* () {
      const { atoms, ids, registry } = yield* setup();
      const loads: string[] = [];
      yield* connectFakeAgent(CODEX, pagedAgent({ '': { sessions: [row('a', '2026-01-01T00:00:00Z')] } }, loads, true));
      advertise(registry, CODEX, {});
      yield* runAtomFn(registry, atoms.openImportAtomFn, '/proj');

      const error = yield* Effect.flip(
        runAtomFn(registry, atoms.importSessionAtomFn, { launchTarget: CODEX, sessionId: 'a' }),
      );

      assert.strictEqual(error._tag, 'ImportSessionFailed');
      assert.deepStrictEqual(loads, ['a']);
      const snapshot = registry.get(backendHarnessSnapshotAtom(CODEX));
      assert.deepStrictEqual(snapshot.sessionHistory, []);
      assert.notProperty(snapshot.sessions, 'a');
      assert.isUndefined(registry.get(selectedAtom));
      assert.deepStrictEqual(ids(), [`${CODEX}:a`]);
    }).pipe(Effect.scoped),
  );
});
