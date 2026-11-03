import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import type { Atom } from 'effect/reactivity';

import type { BackendHarnessSnapshot, SessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { initialBackendHarnessSnapshot, initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { steerChatItemEffect } from './chat.atoms.ts';

const launchTarget = 'claude-agent-acp' as const;
const sessionId = 's1';

const steeringInitializeResult = { _meta: { steering: { supported: true } } };

const makeGet = (session: Partial<SessionSnapshot>, initializeResult: unknown = steeringInitializeResult) => {
  const snapshot: BackendHarnessSnapshot = {
    ...initialBackendHarnessSnapshot(),
    initializeResult,
    phase: 'ready',
    sessions: { [sessionId]: { ...initialSessionSnapshot(sessionId, 'active'), ...session } },
  };
  return Object.assign(((_atom: unknown) => snapshot) as Atom.FnContext, {
    registry: { update: () => undefined },
  }) as unknown as Atom.FnContext;
};

const steer = (get: Atom.FnContext, text = 'hello') =>
  // Gating failures return before any Agent connection is required.
  steerChatItemEffect({ launchTarget, sessionId, text }, get) as Effect.Effect<void, Error>;

describe('steerChatItemEffect gating', () => {
  const rejected = (name: string, session: Partial<SessionSnapshot>, text = 'hello', init?: unknown) => {
    it.effect(`fails (so the draft is restored) ${name}`, () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(steer(init === undefined ? makeGet(session) : makeGet(session, init), text));
        assert.match(error.message, /Steering is not available/);
      }),
    );
  };

  rejected('when no prompt is in flight', {});
  rejected('when Prompt turn cancel was requested', { pendingClientRequest: 'prompt', promptCancelRequested: true });
  rejected('when the draft is empty', { pendingClientRequest: 'prompt' }, '   ');
  rejected('when the Agent does not advertise Steering supported', { pendingClientRequest: 'prompt' }, 'hello', {});
});
