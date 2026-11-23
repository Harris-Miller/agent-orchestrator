/** A Spawned subagent session's life ends with its parent's: close, delete, Prompt turn cancel, Connection lost. */
import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';

import { createHostRuntime } from '../../createHostRuntime.ts';
import { answer, CHILD, childIndex, PARENT, setup, until } from '../../host/spawnSubagent.testing.ts';
import { getSubagent } from '../../host/subagent.ts';
import { parseSubagentResults } from '../../host/subagentResult.ts';

import { backendHarnessSnapshotAtom, configOptionIndexAtom } from '../backendState.atoms.ts';
import { createChatAtoms } from '../chat.atoms.ts';
import { CODEX } from '../fakeAgent.testing.ts';
import { makeHarnessEventFold } from '../harnessEventFold.ts';
import { mockHostLayer } from '../mockHostLayer.testing.ts';
import { runAtomFn } from '../runAtomFn.testing.ts';
import { createSessionLifecycleAtoms } from '../sessionLifecycle.atoms.ts';
import { allLinks } from './links.ts';

const SECOND = 'claude-2';

/** Two children of the parent: `claude-1` in the foreground (its call still open), `claude-2` in the background. */
const twoChildren = Effect.fnUntraced(function* () {
  const release = Deferred.makeUnsafe<null>();
  const parentPrompts: string[] = [];
  const h = yield* setup({ duringPrompt: Deferred.await(release) }, { promptTexts: parentPrompts });
  const runtime = createHostRuntime(mockHostLayer);
  const chat = createChatAtoms(runtime);
  const lifecycle = createSessionLifecycleAtoms(runtime, () => Effect.void);
  h.registry.mount(chat.cancelPromptAtomFn);
  h.registry.mount(lifecycle.deactivateSessionAtomFn);
  h.registry.mount(lifecycle.deleteSessionAtomFn);
  h.setParent({ pendingClientRequest: 'prompt' });
  const foreground = yield* Effect.forkChild(h.spawn());
  yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));
  const background = yield* h.spawn({ description: 'Second', runInBackground: true, task: 'Second task' });
  assert.isFalse(background.isError);
  yield* until(() => h.childCalls.includes(`prompt:${SECOND}`));
  const mirrors = () => {
    const { subagents } = h.registry.get(backendHarnessSnapshotAtom(CODEX));
    return [getSubagent(subagents, CHILD)?.state?.state, getSubagent(subagents, SECOND)?.state?.state];
  };
  return { ...h, chat, foreground, lifecycle, mirrors, parentPrompts, release };
});

describe('ending a parent ends its children', () => {
  it.effect('closing the parent cancels and closes every child and removes the links', () =>
    Effect.gen(function* () {
      const h = yield* twoChildren();

      yield* runAtomFn(h.registry, h.lifecycle.deactivateSessionAtomFn, { launchTarget: CODEX, sessionId: PARENT });

      assert.includeMembers(h.childCalls, [`cancel:${CHILD}`, `cancel:${SECOND}`, `close:${CHILD}`, `close:${SECOND}`]);
      assert.notInclude(h.childCalls, `delete:${CHILD}`);
      assert.strictEqual(allLinks(h.registry).length, 0);
      assert.deepStrictEqual(h.mirrors(), ['cancelled', 'cancelled']);
      const child = h.registry.get(backendHarnessSnapshotAtom('claude-agent-acp')).sessions[CHILD];
      assert.strictEqual(child.status, 'inactive');
      assert.isTrue((yield* Fiber.join(h.foreground)).isError);
      yield* Deferred.succeed(h.release, null);
      // Nothing is reported to a parent that is gone.
      assert.deepStrictEqual(h.parentPrompts, []);
    }).pipe(Effect.scoped),
  );

  it.effect('deleting the parent closes (never deletes) every child', () =>
    Effect.gen(function* () {
      const h = yield* twoChildren();

      yield* runAtomFn(h.registry, h.lifecycle.deleteSessionAtomFn, { launchTarget: CODEX, sessionId: PARENT });

      assert.includeMembers(h.childCalls, [`close:${CHILD}`, `close:${SECOND}`]);
      assert.notInclude(h.childCalls, `delete:${CHILD}`);
      assert.notInclude(h.childCalls, `delete:${SECOND}`);
      assert.strictEqual(allLinks(h.registry).length, 0);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );

  it.effect('a Prompt turn cancel cancels the foreground child but spares the background one', () =>
    Effect.gen(function* () {
      const h = yield* twoChildren();

      yield* runAtomFn(h.registry, h.chat.cancelPromptAtomFn, { launchTarget: CODEX, sessionId: PARENT });
      yield* until(() => h.childCalls.includes(`cancel:${CHILD}`));

      assert.notInclude(h.childCalls, `cancel:${SECOND}`);
      assert.strictEqual(allLinks(h.registry).length, 2);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );

  it.effect('the parent connection being lost closes the children and drops the links', () =>
    Effect.gen(function* () {
      const h = yield* twoChildren();
      const parentFold = makeHarnessEventFold({
        setModelPickerPrefs: () => undefined,
        launchTarget: CODEX,
        registry: h.registry,
        runFork: effect => {
          Effect.runFork(Effect.provide(effect, mockHostLayer));
        },
      });

      parentFold.onConnectionLost();
      yield* until(() => allLinks(h.registry).length === 0);

      assert.includeMembers(h.childCalls, [`close:${CHILD}`, `close:${SECOND}`]);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );
});

describe('a child whose connection is lost', () => {
  it.effect('fails: the foreground call errors and the background child reports failed', () =>
    Effect.gen(function* () {
      const h = yield* twoChildren();
      // The parent is idle again, so the background child's report goes out as a Prompt turn.
      h.setParent({ pendingClientRequest: undefined });

      h.childFold.onConnectionLost();

      const foreground = yield* Fiber.join(h.foreground);
      assert.isTrue(foreground.isError);
      assert.include(foreground.text, 'connection to Claude was lost');
      yield* until(() => h.parentPrompts.length > 0);
      assert.include(h.parentPrompts[0], 'status="failed"');
      assert.deepStrictEqual(h.mirrors(), ['failed', 'failed']);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );
});

describe('a finished child', () => {
  it.effect('keeps its state when its parent later ends', () =>
    Effect.gen(function* () {
      const h = yield* setup({
        duringPrompt: Effect.sync(() => {
          h.childFold.onSessionUpdate(CHILD, answer('done'));
        }),
      });
      const done = yield* h.spawn();
      assert.isFalse(done.isError);
      assert.strictEqual(parseSubagentResults(done.text)[0].body, 'done');
      const runtime = createHostRuntime(mockHostLayer);
      const lifecycle = createSessionLifecycleAtoms(runtime, () => Effect.void);
      h.registry.mount(lifecycle.deactivateSessionAtomFn);

      yield* runAtomFn(h.registry, lifecycle.deactivateSessionAtomFn, { launchTarget: CODEX, sessionId: PARENT });

      const mirror = getSubagent(h.registry.get(backendHarnessSnapshotAtom(CODEX)).subagents, CHILD);
      assert.strictEqual(mirror?.state?.state, 'completed');
      assert.strictEqual(allLinks(h.registry).length, 0);
    }).pipe(Effect.scoped),
  );
});

describe('a Subagent report the parent refuses', () => {
  it.effect('is retried after a backoff instead of dropped in a tight loop', () =>
    Effect.gen(function* () {
      const parentPrompts: string[] = [];
      const fold: { current?: { onSessionUpdate: (id: string, update: unknown) => void } } = {};
      const h = yield* setup(
        { duringPrompt: Effect.sync(() => fold.current?.onSessionUpdate(CHILD, answer('done'))) },
        { promptTexts: parentPrompts },
      );
      fold.current = h.childFold;
      // The parent is busy with a non-prompt request, so a Send is refused.
      h.setParent({ pendingClientRequest: 'config' });
      assert.isFalse((yield* h.spawn({ runInBackground: true })).isError);
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));
      for (let i = 0; i < 50; i += 1) {
        yield* Effect.yieldNow;
      }
      h.setParent({ pendingClientRequest: undefined });
      yield* TestClock.adjust('250 millis');
      yield* until(() => parentPrompts.length > 0);
      assert.include(parentPrompts[0], 'done');
    }).pipe(Effect.scoped),
  );
});

describe('a child on its parent own launch target', () => {
  it.effect('connection lost settles it failed, ends it cleanly and removes the link', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const h = yield* setup({}, { duringPrompt: Deferred.await(release) });
      h.registry.set(configOptionIndexAtom(CODEX), childIndex);
      h.setParent({ pendingClientRequest: 'prompt' });
      const foreground = yield* Effect.forkChild(h.spawn({ launchTarget: CODEX }));
      yield* until(() => h.parentCalls.includes('prompt:bound-2'));
      const fold = makeHarnessEventFold({
        setModelPickerPrefs: () => undefined,
        launchTarget: CODEX,
        registry: h.registry,
        runFork: effect => {
          Effect.runFork(Effect.provide(effect, mockHostLayer));
        },
      });

      fold.onConnectionLost();
      yield* until(() => allLinks(h.registry).length === 0);

      const result = yield* Fiber.join(foreground);
      assert.isTrue(result.isError);
      assert.include(result.text, 'was lost');
      const snapshot = h.registry.get(backendHarnessSnapshotAtom(CODEX));
      assert.strictEqual(getSubagent(snapshot.subagents, 'bound-2')?.state?.state, 'failed');
      assert.include(h.parentCalls, 'close:bound-2');
      yield* Deferred.succeed(release, null);
    }).pipe(Effect.scoped),
  );
});
