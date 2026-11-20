/** Invariant: `session/list` for a cwd is issued only after its subscription is registered (subscribe, then list). */
import { assert, describe, it } from '@effect/vitest';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Deferred, Effect, Fiber, Layer } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { cwdOfSubscription, setBackendSessionListSubscribe } from '../host/sessionRpc.ts';

import { CODEX, connectFakeAgent, freshRegistry, setPhase } from './fakeAgent.testing.ts';
import { listedCwdsAtom } from './listedCwds.atoms.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { createProjectsAtoms, projectsAtom, projectsLoadedAtom } from './projects.atoms.ts';
import { runAtomFn } from './runAtomFn.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';

/** A usable Codex whose `_session/list/subscribe` waits on `gate`; records the call order and what each list saw registered. */
const fsLayer = Layer.mergeAll(mockHostLayer, mapFsTestServices(new Map<string, MapFsEntry>()));

const setup = Effect.fnUntraced(function* () {
  const registry = yield* freshRegistry;
  const gate = yield* Deferred.make<undefined>();
  const started = yield* Deferred.make<undefined>();
  const calls: string[] = [];
  yield* connectFakeAgent(CODEX, {
    agent: {
      'session/list': ({ cwd }: { cwd: string }) =>
        Effect.sync(() => {
          calls.push(`list ${cwd} registered=${cwdOfSubscription(CODEX, `id-${cwd}`) === cwd}`);
          return { sessions: [] };
        }),
    },
    sessionListSubscribe: ({ cwd }: { cwd: string }) =>
      Effect.gen(function* () {
        calls.push(`subscribe ${cwd}`);
        yield* Deferred.succeed(started, undefined);
        yield* Deferred.await(gate);
        calls.push(`subscribed ${cwd}`);
        return { subscriptionId: `id-${cwd}` };
      }),
    sessionListUnsubscribe: () => Effect.succeed({}),
  });
  setBackendSessionListSubscribe(CODEX, true);
  setPhase(registry, CODEX, 'usable');
  const release = Deferred.succeed(gate, undefined);
  return { calls, registry, release, started: Deferred.await(started) };
});

describe('session/list is issued only after the subscription is registered', () => {
  it.effect('addProjectAtomFn', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.registry.set(projectsLoadedAtom, true);
      const { addProjectAtomFn } = createProjectsAtoms(createHostRuntime(fsLayer));
      const fiber = yield* Effect.forkChild(runAtomFn(s.registry, addProjectAtomFn, '/new'));
      yield* s.started;
      assert.deepStrictEqual(s.calls, ['subscribe /new']);

      yield* s.release;
      yield* Fiber.join(fiber);
      yield* Effect.yieldNow;
      assert.deepStrictEqual(s.calls, ['subscribe /new', 'subscribed /new', 'list /new registered=true']);
    }).pipe(Effect.scoped),
  );

  it.effect('refreshAllSessionHistoriesAtomFn', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const runtime = createHostRuntime(mockHostLayer);
      const { cancelPromptAtomFn } = createChatAtoms(runtime);
      const { refreshAllSessionHistoriesAtomFn } = createSessionLifecycleAtoms(runtime, cancelPromptAtomFn);
      s.registry.set(projectsAtom, ['/proj']);
      assert.deepStrictEqual(s.registry.get(listedCwdsAtom), ['/proj']);
      const fiber = yield* Effect.forkChild(runAtomFn(s.registry, refreshAllSessionHistoriesAtomFn, undefined));
      yield* s.started;
      assert.deepStrictEqual(s.calls, ['subscribe /proj']);

      yield* s.release;
      yield* Fiber.join(fiber);
      yield* Effect.yieldNow;
      assert.deepStrictEqual(s.calls, ['subscribe /proj', 'subscribed /proj', 'list /proj registered=true']);
    }).pipe(Effect.scoped),
  );
});
