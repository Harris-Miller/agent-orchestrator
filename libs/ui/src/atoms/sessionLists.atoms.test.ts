import { assert, describe, it } from '@effect/vitest';
import { pinSession, updateSessionIndex } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import type { HostServices } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import { MOUNTED_AGENT_LAUNCH_TARGETS, toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { advertise, CLAUDE, CODEX, connectFakeAgent, freshRegistry, setPhase } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from './pinnedSessions.atoms.ts';
import { hydrateCachedRows } from './projects.atoms.ts';
import {
  beginSessionList,
  clearListStatesOfCwd,
  listCwdsOnUsableTargets,
  projectListStatusAtom,
  sessionListStatesAtom,
} from './sessionLists.atoms.ts';

type Page = { readonly sessions: readonly { sessionId: string; cwd: string }[]; readonly nextCursor?: string };
const row = (cwd: string, sessionId: string) => ({ cwd, sessionId });

/** Fake `session/list` serving `pages[cwd][cursor ?? '']`; a `'fail'` page fails; records every request. */
const listingAgent = (requests: Record<string, unknown>[], pages: Record<string, Record<string, Page | 'fail'>>) => ({
  agent: {
    'session/list': (req: { cwd?: string; cursor?: string }) =>
      Effect.suspend(() => {
        requests.push(req);
        const page = pages[req.cwd ?? '']?.[req.cursor ?? ''];
        return page === undefined || page === 'fail' ? Effect.fail(new Error('boom')) : Effect.succeed(page);
      }),
  },
});

const setup = Effect.fnUntraced(function* (launchTargets: readonly AgentLaunchTarget[] = [CODEX]) {
  const registry = yield* freshRegistry;
  const store = new Map<string, MapFsEntry>();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
  const forked: Effect.Effect<void, never, HostServices>[] = [];
  const runFork = (effect: Effect.Effect<void, never, HostServices>) => {
    forked.push(effect);
  };
  for (const launchTarget of launchTargets) advertise(registry, launchTarget, {});
  // Mounted targets this test does not use have failed to start, so they never hold a Project in loading.
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    if (!launchTargets.includes(launchTarget)) setPhase(registry, launchTarget, 'error');
  }
  const drain = Effect.suspend(() => Effect.forEach(forked.splice(0), effect => effect, { discard: true })).pipe(
    Effect.provide(layer),
  );
  const list = (cwds: readonly string[], options?: { readonly onlyIncomplete?: boolean }) =>
    listCwdsOnUsableTargets(registry, cwds, runFork, options).pipe(Effect.andThen(drain));
  const history = (launchTarget: AgentLaunchTarget) =>
    registry
      .get(backendHarnessSnapshotAtom(launchTarget))
      .sessionHistory.map(entry => entry.sessionId)
      .toSorted();
  return { drain, history, layer, list, registry };
});

describe('Per-Project Session History lists', () => {
  it.effect('sends each Project cwd, pages to exhaustion and merges every page', () =>
    Effect.gen(function* () {
      const { history, list } = yield* setup();
      const requests: Record<string, unknown>[] = [];
      yield* connectFakeAgent(
        CODEX,
        listingAgent(requests, {
          '/a': { '': { sessions: [row('/a', 'a1')], nextCursor: 'c1' }, c1: { sessions: [row('/a', 'a2')] } },
          '/b': { '': { sessions: [row('/b', 'b1')] } },
        }),
      );
      yield* list(['/a', '/b']);
      assert.deepStrictEqual(history(CODEX), ['a1', 'a2', 'b1']);
      assert.sameDeepMembers(
        requests.map(request => [request.cwd, request.cursor]),
        [
          ['/a', undefined],
          ['/a', 'c1'],
          ['/b', undefined],
        ],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('sends the AIR list meta only to sessionIndex launch targets', () =>
    Effect.gen(function* () {
      const { list } = yield* setup([CODEX, 'cursor-acp']);
      const codex: Record<string, unknown>[] = [];
      const cursor: Record<string, unknown>[] = [];
      yield* connectFakeAgent(CODEX, listingAgent(codex, { '/a': { '': { sessions: [] } } }));
      yield* connectFakeAgent('cursor-acp', listingAgent(cursor, { '/a': { '': { sessions: [] } } }));
      yield* list(['/a']);
      assert.isDefined(codex[0]?._meta);
      assert.deepStrictEqual(cursor, [{ cwd: '/a' }]);
    }).pipe(Effect.scoped),
  );

  it.effect('a complete list drops that cwd rows it no longer lists and leaves other cwds alone', () =>
    Effect.gen(function* () {
      const { history, list, registry } = yield* setup();
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [
          { cwd: '/a', sessionId: 'gone', unavailable: true },
          { cwd: '/other', sessionId: 'elsewhere', unavailable: true },
        ],
      }));
      yield* connectFakeAgent(CODEX, listingAgent([], { '/a': { '': { sessions: [row('/a', 'a1')] } } }));
      yield* list(['/a']);
      assert.deepStrictEqual(history(CODEX), ['a1', 'elsewhere']);
      assert.strictEqual(registry.get(projectListStatusAtom('/a')).state, 'complete');
    }).pipe(Effect.scoped),
  );

  it.effect('a mid-paging failure keeps rows, marks only that Project incomplete, and never sweeps pins', () =>
    Effect.gen(function* () {
      const { drain, history, layer, list, registry } = yield* setup();
      const pinned = yield* pinSession(toLaunchTarget(CODEX), { cwd: '/a', sessionId: 'pinned-a' }).pipe(
        Effect.provide(layer),
      );
      registry.set(pinnedSessionsAtom(CODEX), pinned.pinned);
      registry.set(pinsLoadedAtom(CODEX), true);
      yield* connectFakeAgent(
        CODEX,
        listingAgent([], {
          '/a': { '': { sessions: [row('/a', 'a1')], nextCursor: 'c1' }, c1: 'fail' },
          '/b': { '': { sessions: [row('/b', 'b1')] } },
        }),
      );
      yield* list(['/a', '/b']);
      yield* drain;
      assert.deepStrictEqual(history(CODEX), ['a1', 'b1']);
      assert.deepStrictEqual(registry.get(projectListStatusAtom('/a')), {
        incompleteLaunchTargets: [CODEX],
        state: 'incomplete',
      });
      assert.strictEqual(registry.get(projectListStatusAtom('/b')).state, 'complete');
      assert.deepStrictEqual(
        registry.get(pinnedSessionsAtom(CODEX)).map(pin => pin.sessionId),
        ['pinned-a'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('a failing provider does not hide another provider rows for the Project', () =>
    Effect.gen(function* () {
      const { history, list, registry } = yield* setup([CODEX, CLAUDE]);
      yield* connectFakeAgent(CODEX, listingAgent([], { '/a': { '': 'fail' } }));
      yield* connectFakeAgent(CLAUDE, listingAgent([], { '/a': { '': { sessions: [row('/a', 'c1')] } } }));
      yield* list(['/a']);
      assert.deepStrictEqual(history(CLAUDE), ['c1']);
      assert.deepStrictEqual(registry.get(projectListStatusAtom('/a')).incompleteLaunchTargets, [CODEX]);
    }).pipe(Effect.scoped),
  );

  it.effect('a complete list sweeps only pins of its own cwd that it no longer lists', () =>
    Effect.gen(function* () {
      const { layer, list, registry } = yield* setup();
      yield* pinSession(toLaunchTarget(CODEX), { cwd: '/a', sessionId: 'gone-a' }).pipe(Effect.provide(layer));
      const both = yield* pinSession(toLaunchTarget(CODEX), { cwd: '/unloaded', sessionId: 'outside' }).pipe(
        Effect.provide(layer),
      );
      registry.set(pinnedSessionsAtom(CODEX), both.pinned);
      registry.set(pinsLoadedAtom(CODEX), true);
      yield* connectFakeAgent(CODEX, listingAgent([], { '/a': { '': { sessions: [] } } }));
      yield* list(['/a']);
      assert.deepStrictEqual(
        registry.get(pinnedSessionsAtom(CODEX)).map(pin => pin.sessionId),
        ['outside'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('Retry re-lists only the incomplete lists', () =>
    Effect.gen(function* () {
      const { history, list } = yield* setup();
      const requests: Record<string, unknown>[] = [];
      const pages: Record<string, Record<string, Page | 'fail'>> = {
        '/a': { '': 'fail' },
        '/b': { '': { sessions: [row('/b', 'b1')] } },
      };
      yield* connectFakeAgent(CODEX, listingAgent(requests, pages));
      yield* list(['/a', '/b']);
      requests.length = 0;
      pages['/a'] = { '': { sessions: [row('/a', 'a1')] } };
      yield* list(['/a', '/b'], { onlyIncomplete: true });
      assert.deepStrictEqual(
        requests.map(request => request.cwd),
        ['/a'],
      );
      assert.deepStrictEqual(history(CODEX), ['a1', 'b1']);
    }).pipe(Effect.scoped),
  );

  it.effect('skips launch targets that are not usable', () =>
    Effect.gen(function* () {
      const { list } = yield* setup([]);
      const requests: Record<string, unknown>[] = [];
      yield* connectFakeAgent(CODEX, listingAgent(requests, { '/a': { '': { sessions: [] } } }));
      yield* list(['/a']);
      assert.deepStrictEqual(requests, []);
    }).pipe(Effect.scoped),
  );

  it.effect('a launch target that never starts does not hold a Project in loading once another list completed', () =>
    Effect.gen(function* () {
      const { list, registry } = yield* setup([CODEX]);
      // Claude is mounted but never starts (e.g. a beta target without its CLI): it stays `connecting` with no list.
      setPhase(registry, CLAUDE, 'connecting');
      yield* connectFakeAgent(CODEX, listingAgent([], { '/a': { '': { sessions: [] } } }));
      yield* list(['/a']);
      assert.strictEqual(registry.get(sessionListStatesAtom).size, 1);
      assert.strictEqual(registry.get(projectListStatusAtom('/a')).state, 'complete');
    }).pipe(Effect.scoped),
  );

  it.effect('reports failed providers while another list is still loading', () =>
    Effect.gen(function* () {
      const { list, registry } = yield* setup([CODEX, CLAUDE]);
      yield* connectFakeAgent(CODEX, listingAgent([], { '/a': { '': 'fail' } }));
      yield* connectFakeAgent(CLAUDE, listingAgent([], { '/a': { '': { sessions: [] } } }));
      yield* list(['/a']);
      beginSessionList(registry, CLAUDE, '/a', () => undefined);
      assert.deepStrictEqual(registry.get(projectListStatusAtom('/a')), {
        incompleteLaunchTargets: [CODEX],
        state: 'loading',
      });
    }).pipe(Effect.scoped),
  );

  it.effect('Stop tracking while a list is in flight ignores its later pages and completion', () =>
    Effect.gen(function* () {
      const { drain, history, registry } = yield* setup();
      const run = beginSessionList(registry, CODEX, '/a', () => undefined);
      clearListStatesOfCwd(registry, '/a');
      run.page({ sessions: [row('/a', 'late')] });
      yield* run.complete();
      run.fail();
      yield* drain;
      assert.deepStrictEqual(history(CODEX), []);
      assert.strictEqual(registry.get(sessionListStatesAtom).size, 0);
    }).pipe(Effect.scoped),
  );

  it.effect('hydrates a newly added Project cached rows as unavailable without duplicating live rows', () =>
    Effect.gen(function* () {
      const { layer, registry } = yield* setup();
      yield* updateSessionIndex(
        toLaunchTarget(CODEX),
        {
          '/new': [
            { cwd: '/new', sessionId: 'cached' },
            { cwd: '/new', sessionId: 'live' },
          ],
        },
        new Set(),
      ).pipe(Effect.provide(layer));
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [{ cwd: '/new', sessionId: 'live' }],
      }));
      yield* hydrateCachedRows(registry, ['/new']).pipe(Effect.provide(layer));
      assert.deepStrictEqual(
        registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory.map(e => [e.sessionId, e.unavailable]),
        [
          ['live', undefined],
          ['cached', true],
        ],
      );
    }).pipe(Effect.scoped),
  );
});
