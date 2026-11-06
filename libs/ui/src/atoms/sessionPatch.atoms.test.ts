import { assert, describe, it } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import type { Atom } from 'effect/reactivity';

import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';

import { backendHarnessSnapshotAtom, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { withSessionClientRequest } from './sessionPatch.atoms.ts';

/** An Atom.fn context whose `get.set` no-ops (as after AtomRegistry Lifetime.dispose); its registry still writes. */
const setup = (launchTarget: AgentLaunchTarget, sessionId: string) => {
  const registry = AtomRegistry.make();
  updateHarnessSnapshot(registry, launchTarget, current => ({
    ...current,
    phase: 'ready',
    sessions: { [sessionId]: initialSessionSnapshot(sessionId, 'active') },
  }));
  const get = Object.assign((atom: Atom.Atom<unknown>) => registry.get(atom), {
    registry,
    set: () => undefined,
  }) as unknown as Atom.FnContext;
  const session = () => registry.get(backendHarnessSnapshotAtom(launchTarget)).sessions[sessionId];
  return { get, session };
};

describe('withSessionClientRequest', () => {
  it.effect('sets prompt kind and clears pendingClientRequest on interrupt even when get.set no-ops', () =>
    Effect.gen(function* () {
      const { get, session } = setup('claude-agent-acp', 's1');

      const fiber = yield* Effect.forkChild(
        withSessionClientRequest('claude-agent-acp', get, 's1', 'prompt', Effect.never),
      );
      yield* Effect.yieldNow;
      assert.strictEqual(session().pendingClientRequest, 'prompt');

      yield* Fiber.interrupt(fiber);

      assert.strictEqual(session().pendingClientRequest, undefined);
      assert.strictEqual(session().promptCancelRequested, undefined);
    }),
  );

  it.effect('sets config kind while RPC runs', () =>
    Effect.gen(function* () {
      const { get, session } = setup('codex-acp', 's2');

      const fiber = yield* Effect.forkChild(withSessionClientRequest('codex-acp', get, 's2', 'config', Effect.never));
      yield* Effect.yieldNow;
      assert.strictEqual(session().pendingClientRequest, 'config');
      yield* Fiber.interrupt(fiber);
    }),
  );
});
