import { assert, describe, it } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import type { Atom } from 'effect/reactivity';

import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { initialBackendHarnessSnapshot, initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { withSessionClientRequest } from './sessionPatch.atoms.ts';

describe('withSessionClientRequest', () => {
  it.effect('sets prompt kind and clears pendingClientRequest on interrupt when get.set no-ops', () =>
    Effect.gen(function* () {
      const launchTarget = 'claude-agent-acp' as const;
      const sessionId = 's1';
      let snapshot: BackendHarnessSnapshot = {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          [sessionId]: initialSessionSnapshot(sessionId, 'active'),
        },
      };
      let setNoOp = false;

      const registry = {
        get: () => snapshot,
        set: (_atom: unknown, next: BackendHarnessSnapshot) => {
          snapshot = next;
        },
        update: (_atom: unknown, f: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot) => {
          snapshot = f(snapshot);
        },
      };

      const get = Object.assign(((_atom: unknown) => snapshot) as Atom.FnContext, {
        registry,
        set: (_atom: unknown, next: BackendHarnessSnapshot) => {
          if (setNoOp) {
            return;
          }
          snapshot = next;
        },
      }) as Atom.FnContext;

      const fiber = yield* Effect.forkChild(
        withSessionClientRequest(launchTarget, get, sessionId, 'prompt', Effect.never),
      );
      yield* Effect.yieldNow;
      assert.strictEqual(snapshot.sessions[sessionId].pendingClientRequest, 'prompt');

      // Mimic AtomRegistry Lifetime.dispose: disposed before interrupt finalizers.
      setNoOp = true;
      yield* Fiber.interrupt(fiber);

      assert.strictEqual(snapshot.sessions[sessionId].pendingClientRequest, undefined);
      assert.strictEqual(snapshot.sessions[sessionId].promptCancelRequested, undefined);
    }),
  );

  it.effect('sets config kind while RPC runs', () =>
    Effect.gen(function* () {
      const launchTarget = 'codex-acp' as const;
      const sessionId = 's2';
      let snapshot: BackendHarnessSnapshot = {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          [sessionId]: initialSessionSnapshot(sessionId, 'active'),
        },
      };

      const get = Object.assign(((_atom: unknown) => snapshot) as Atom.FnContext, {
        registry: {
          get: () => snapshot,
          set: (_atom: unknown, next: BackendHarnessSnapshot) => {
            snapshot = next;
          },
          update: (_atom: unknown, f: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot) => {
            snapshot = f(snapshot);
          },
        },
        set: (_atom: unknown, next: BackendHarnessSnapshot) => {
          snapshot = next;
        },
      }) as Atom.FnContext;

      const fiber = yield* Effect.forkChild(
        withSessionClientRequest(launchTarget, get, sessionId, 'config', Effect.never),
      );
      yield* Effect.yieldNow;
      assert.strictEqual(snapshot.sessions[sessionId].pendingClientRequest, 'config');
      yield* Fiber.interrupt(fiber);
    }),
  );
});
