import { assert, describe, it } from '@effect/vitest';
import { Notifier, OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import { AtomRegistry } from 'effect/reactivity';
import type { Atom } from 'effect/reactivity';

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { connectFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { sendPromptSoftCancel } from './sessionPatch.atoms.ts';

type Sent = { body: string; sound: boolean; title: string };

const setup = Effect.fnUntraced(function* (prompt: Effect.Effect<{ stopReason: string }, string>) {
  const sent: Sent[] = [];
  const registry = AtomRegistry.make();
  updateHarnessSnapshot(registry, 'codex-acp', () => ({
    ...initialBackendHarnessSnapshot(),
    phase: 'initialized',
    sessionHistory: [{ cwd: '/w', sessionId: 's1', title: 'My chat' }] as never,
    sessions: { s1: initialSessionSnapshot('s1') },
  }));
  yield* connectFakeAgent('codex-acp', {
    agent: { 'session/prompt': () => prompt },
    notify: () => Effect.void,
    sessionArchive: () => Effect.fail('no-archive'),
    sessionFork: () => Effect.fail('no-fork'),
  });
  const get = Object.assign((atom: Atom.Atom<unknown>) => registry.get(atom), {
    set: (atom: Atom.Writable<unknown, unknown>, value: unknown) => {
      registry.set(atom, value);
    },
  }) as unknown as Atom.FnContext;
  const layer = Layer.mergeAll(
    Layer.succeed(Notifier, {
      isWindowFocused: Effect.succeed(false),
      notify: input => {
        sent.push({ ...input });
        return Effect.void;
      },
      supported: 'os',
    }),
    Layer.succeed(OS, {
      arch: () => 'arm64',
      cwd: () => '/h',
      env: () => ({}),
      homedir: () => '/h',
      platform: () => 'linux',
    }),
    layerNoop({ exists: () => Effect.succeed(false) }),
    posixPathLayer,
  );
  return { get, layer, sent };
});

/** Lets the detached notify fiber run to completion. */
const settle = Effect.repeat(Effect.yieldNow, { times: 50 });

describe('sendPromptSoftCancel Attention event', () => {
  it.effect('notifies once with the chat title when the turn ends', () =>
    Effect.gen(function* () {
      const h = yield* setup(Effect.succeed({ stopReason: 'end_turn' }));
      yield* sendPromptSoftCancel('codex-acp', h.get, 's1', 'hi').pipe(Effect.provide(h.layer));
      yield* settle;
      assert.deepStrictEqual(h.sent, [{ body: 'Finished', sound: true, title: 'My chat' }]);
    }),
  );

  it.effect('does not notify when the turn was cancelled', () =>
    Effect.gen(function* () {
      const h = yield* setup(Effect.succeed({ stopReason: 'cancelled' }));
      yield* sendPromptSoftCancel('codex-acp', h.get, 's1', 'hi').pipe(Effect.provide(h.layer));
      yield* settle;
      assert.deepStrictEqual(h.sent, []);
    }),
  );

  it.effect('does not notify on an RPC error', () =>
    Effect.gen(function* () {
      const h = yield* setup(Effect.fail('rpc-boom'));
      yield* Effect.exit(sendPromptSoftCancel('codex-acp', h.get, 's1', 'hi').pipe(Effect.provide(h.layer)));
      yield* settle;
      assert.deepStrictEqual(h.sent, []);
    }),
  );
});
