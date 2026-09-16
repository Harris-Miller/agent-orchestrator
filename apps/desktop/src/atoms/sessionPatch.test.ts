import { assert, describe, it } from '@effect/vitest';
import { Effect, Fiber } from 'effect';

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from '../acp/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../acp/acpSessionBootstrap.ts';

import type { AcpAtomGet } from './acpRuntime.ts';
import { applySessionActivationResult, withSessionClientRequest } from './sessionPatch.ts';

describe('applySessionActivationResult cwd continuity', () => {
  it('preserves existing snapshot cwd through activation merge', () => {
    const existing = {
      cwd: '/proj',
      sessionId: 's1',
      status: 'activating' as const,
      transcript: initialSessionSnapshot('s1').transcript,
    };
    const next = applySessionActivationResult('s1', { configOptions: [] }, existing);
    assert.strictEqual(next.cwd, '/proj');
    assert.strictEqual(next.status, 'active');
  });

  it('create-shaped stamp via existing cwd keeps cwd after later merge', () => {
    const created = applySessionActivationResult('s1', { configOptions: [] }, { cwd: '/proj' });
    assert.strictEqual(created.cwd, '/proj');
    const remapped = applySessionActivationResult('s1', { models: [] }, created);
    assert.strictEqual(remapped.cwd, '/proj');
  });
});

describe('withSessionClientRequest', () => {
  it.effect('clears pendingClientRequest on interrupt when get.set no-ops (disposed Atom lifetime)', () =>
    Effect.gen(function* () {
      const launchTarget = 'claude-agent-acp' as const;
      const sessionId = 's1';
      let snapshot: BackendHarnessSnapshot = {
        ...initialBackendHarnessSnapshot(),
        phase: 'ready',
        sessions: {
          [sessionId]: {
            ...initialSessionSnapshot(sessionId, 'active'),
            pendingClientRequest: false,
          },
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

      const get = Object.assign(((_atom: unknown) => snapshot) as AcpAtomGet, {
        registry,
        set: (_atom: unknown, next: BackendHarnessSnapshot) => {
          if (setNoOp) {
            return;
          }
          snapshot = next;
        },
      }) as AcpAtomGet;

      const fiber = yield* Effect.forkChild(withSessionClientRequest(launchTarget, get, sessionId, Effect.never));
      yield* Effect.yieldNow;
      assert.strictEqual(snapshot.sessions[sessionId].pendingClientRequest, true);

      // Mimic AtomRegistry Lifetime.dispose: disposed before interrupt finalizers.
      setNoOp = true;
      yield* Fiber.interrupt(fiber);

      assert.strictEqual(snapshot.sessions[sessionId].pendingClientRequest, false);
    }),
  );
});
