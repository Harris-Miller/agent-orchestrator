/** Background `spawn_subagent`, `cancel_subagent` and the Subagent report's delivery to the parent. */
import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { backendHarnessSnapshotAtom } from '../atoms/backendState.atoms.ts';
import { composerAtom, createComposerAtoms } from '../atoms/composer.atoms.ts';
import { runAtomFn } from '../atoms/runAtomFn.ts';
import { createHostRuntime } from '../createHostRuntime.ts';
import { advertise, CODEX } from '../atoms/fakeAgent.testing.ts';
import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';
import { select } from '../atoms/virtualSession.atoms.ts';
import { allLinks } from '../atoms/subagentLinkRegistry.ts';

import { answer, CHILD, PARENT, setup, until } from './spawnSubagent.testing.ts';
import { parseSubagentResults } from './subagentResult.ts';

const STEERING = { _meta: { steering: { supported: true } } };

/** A child that answers `text` once `release` is released. */
const child = (
  release: Deferred.Deferred<null>,
  text: string,
  onUpdate: () => (sessionId: string, update: object) => void,
) => ({
  duringPrompt: Effect.andThen(
    Deferred.await(release),
    Effect.sync(() => {
      onUpdate()(CHILD, answer(text));
    }),
  ),
});

const reportText = (text: string, status = 'completed', id = CHILD) =>
  `<subagent-report id="${id}" status="${status}">\nsubagent: Review\ntask: Review the diff\n\n${text}\n</subagent-report>`;

const steeredTexts = (registry: AtomRegistry.AtomRegistry) =>
  registry
    .get(backendHarnessSnapshotAtom(CODEX))
    .sessions[PARENT].transcript.items.flatMap(item => (item.kind === 'user_message' ? [item.text] : []));

describe('spawn_subagent (background)', () => {
  it.effect('answers at once with the subagent id, then reports as a Prompt turn when the parent is idle', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const parentPrompts: string[] = [];
      const h = yield* setup(
        child(release, 'All good.', () => (id, update) => {
          h.childFold.onSessionUpdate(id, update);
        }),
        {
          promptTexts: parentPrompts,
        },
      );

      const started = yield* h.spawn({ runInBackground: true });
      assert.isFalse(started.isError);
      assert.strictEqual(parseSubagentResults(started.text)[0].id, CHILD);
      assert.deepStrictEqual(parentPrompts, []);

      yield* Deferred.succeed(release, null);
      yield* until(() => parentPrompts.length > 0);
      assert.deepStrictEqual(parentPrompts, [reportText('All good.')]);
    }).pipe(Effect.scoped),
  );

  it.effect('reports as Steering when the parent is mid-turn and supports it', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const h = yield* setup(
        child(release, 'Done.', () => (id, update) => {
          h.childFold.onSessionUpdate(id, update);
        }),
      );
      advertise(h.registry, CODEX, STEERING);
      h.setParent({ pendingClientRequest: 'prompt' });

      yield* h.spawn({ runInBackground: true });
      yield* Deferred.succeed(release, null);
      yield* until(() => h.parentCalls.includes(`steer:${PARENT}`));

      assert.deepStrictEqual(steeredTexts(h.registry), [reportText('Done.')]);
      assert.notInclude(h.parentCalls, `prompt:${PARENT}`);
    }).pipe(Effect.scoped),
  );

  it.effect('waits for the turn end when the parent waits on a Pending interaction', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const parentPrompts: string[] = [];
      const h = yield* setup(
        child(release, 'Done.', () => (id, update) => {
          h.childFold.onSessionUpdate(id, update);
        }),
        {
          promptTexts: parentPrompts,
        },
      );
      advertise(h.registry, CODEX, STEERING);
      h.setParent({
        pendingClientRequest: 'prompt',
        pendingPermission: { request: {} as never, resolve: () => undefined, sessionId: PARENT },
      });

      yield* h.spawn({ runInBackground: true });
      yield* Deferred.succeed(release, null);
      for (let i = 0; i < 30; i += 1) {
        yield* Effect.yieldNow;
      }
      assert.deepStrictEqual([h.parentCalls.includes(`steer:${PARENT}`), parentPrompts], [false, []]);

      h.setParent({ pendingClientRequest: undefined, pendingPermission: undefined });
      yield* until(() => parentPrompts.length > 0);
      assert.deepStrictEqual(parentPrompts, [reportText('Done.')]);
    }).pipe(Effect.scoped),
  );

  it.effect('two children finishing together produce two serialized reports', () =>
    Effect.gen(function* () {
      const first = Deferred.makeUnsafe<null>();
      const second = Deferred.makeUnsafe<null>();
      const parentTurn = Deferred.makeUnsafe<null>();
      const parentPrompts: string[] = [];
      let started = 0;
      const h = yield* setup(
        {
          duringPrompt: Effect.suspend(() => {
            started += 1;
            return Deferred.await(started === 1 ? first : second);
          }),
        },
        {
          duringPrompt: Effect.suspend(() => (parentPrompts.length === 1 ? Deferred.await(parentTurn) : Effect.void)),
          promptTexts: parentPrompts,
        },
      );
      yield* h.spawn({ runInBackground: true });
      yield* h.spawn({ description: 'Second', runInBackground: true, task: 'Second task' });
      yield* Deferred.succeed(first, null);
      yield* Deferred.succeed(second, null);

      yield* until(() => parentPrompts.length === 1);
      for (let i = 0; i < 30; i += 1) {
        yield* Effect.yieldNow;
      }
      // The second report waits for the first report's turn to begin and finish its hold on the parent.
      assert.strictEqual(parentPrompts.length, 1);
      yield* Deferred.succeed(parentTurn, null);
      yield* until(() => parentPrompts.length === 2);
      assert.include(parentPrompts[0], 'id="claude-1"');
      assert.include(parentPrompts[1], 'id="claude-2"');
    }).pipe(Effect.scoped),
  );

  it.effect(
    'a queued message and a report on the same turn end: the queued message goes first, the draft is untouched',
    () =>
      Effect.gen(function* () {
        const release = Deferred.makeUnsafe<null>();
        const parentPrompts: string[] = [];
        // Steering is offered but the agent refuses it, so the report waits for the turn end like the Queued message.
        const h = yield* setup(
          child(release, 'Done.', () => (id, update) => {
            h.childFold.onSessionUpdate(id, update);
          }),
          {
            promptTexts: parentPrompts,
            steering: 'fail',
          },
        );
        advertise(h.registry, CODEX, STEERING);
        const { editComposerAtomFn, submitComposerAtomFn } = createComposerAtoms(createHostRuntime(mockHostLayer));
        h.registry.mount(editComposerAtomFn);
        h.registry.mount(submitComposerAtomFn);
        yield* select(h.registry, { _tag: 'Session', sessionId: PARENT });
        yield* runAtomFn(h.registry, editComposerAtomFn, { draft: 'my own message' });
        h.setParent({ pendingClientRequest: 'prompt' });
        h.registry.set(submitComposerAtomFn, 'queue');
        for (let i = 0; i < 10; i += 1) {
          yield* Effect.yieldNow;
        }
        assert.strictEqual(h.registry.get(composerAtom).queued?.draft, 'my own message');
        yield* h.spawn({ runInBackground: true });
        yield* Deferred.succeed(release, null);

        // The parent's turn ends: both waiters wake.
        h.setParent({ pendingClientRequest: undefined });
        yield* until(() => parentPrompts.length === 2);

        assert.deepStrictEqual(parentPrompts, ['my own message', reportText('Done.')]);
        // The refused Send never put the message back: the draft stays as it was after Queue.
        assert.strictEqual(h.registry.get(composerAtom).draft, '');
      }).pipe(Effect.scoped),
  );

  it.effect('drops the report when the parent is gone', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const parentPrompts: string[] = [];
      const h = yield* setup(
        child(release, 'Done.', () => (id, update) => {
          h.childFold.onSessionUpdate(id, update);
        }),
        {
          promptTexts: parentPrompts,
        },
      );
      yield* h.spawn({ runInBackground: true });
      h.setParent({ status: 'inactive' });
      yield* Deferred.succeed(release, null);
      for (let i = 0; i < 30; i += 1) {
        yield* Effect.yieldNow;
      }
      assert.deepStrictEqual([parentPrompts, h.parentCalls.includes(`steer:${PARENT}`)], [[], false]);
    }).pipe(Effect.scoped),
  );

  it.effect('wait_subagent that collects the outcome suppresses the report', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const parentPrompts: string[] = [];
      const h = yield* setup(
        child(release, 'Done.', () => (id, update) => {
          h.childFold.onSessionUpdate(id, update);
        }),
        {
          promptTexts: parentPrompts,
        },
      );
      // The parent is busy, so the report would wait; the wait gets there first.
      h.setParent({ pendingClientRequest: 'prompt' });
      yield* h.spawn({ runInBackground: true });
      const waiting = yield* Effect.forkChild(h.call('wait_subagent', { ids: [CHILD] }));
      yield* Deferred.succeed(release, null);
      assert.include((yield* Fiber.join(waiting)).text, 'Done.');
      h.setParent({ pendingClientRequest: undefined });
      for (let i = 0; i < 30; i += 1) {
        yield* Effect.yieldNow;
      }
      assert.deepStrictEqual(parentPrompts, []);
    }).pipe(Effect.scoped),
  );

  it.effect('a foreground call interrupted by a hub connection loss ends as a report', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const parentPrompts: string[] = [];
      const h = yield* setup(
        child(release, 'Done.', () => (id, update) => {
          h.childFold.onSessionUpdate(id, update);
        }),
        {
          promptTexts: parentPrompts,
        },
      );
      const call = yield* Effect.forkChild(h.spawn());
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));

      yield* Fiber.interrupt(call);
      yield* Deferred.succeed(release, null);
      yield* until(() => parentPrompts.length > 0);
      assert.deepStrictEqual(parentPrompts, [reportText('Done.')]);
    }).pipe(Effect.scoped),
  );
});

describe('cancel_subagent', () => {
  it.effect('cancels only the caller own running child', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const h = yield* setup({ duringPrompt: Deferred.await(release), prompt: 'cancelled' });
      yield* h.spawn({ runInBackground: true });
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));

      assert.deepStrictEqual(yield* h.call('cancel_subagent', { subagentId: 'someone-elses' }), {
        isError: true,
        text: 'You have no subagent with id "someone-elses".',
      });
      assert.isFalse((yield* h.call('cancel_subagent', { subagentId: CHILD })).isError);
      assert.include(h.childCalls, `cancel:${CHILD}`);

      yield* Deferred.succeed(release, null);
      const [link] = allLinks(h.registry);
      assert.strictEqual((yield* Deferred.await(link.outcome)).status, 'cancelled');
      assert.include((yield* h.call('cancel_subagent', { subagentId: CHILD })).text, 'already finished');
    }).pipe(Effect.scoped),
  );
});
