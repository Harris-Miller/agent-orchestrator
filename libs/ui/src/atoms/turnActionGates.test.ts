/** Every effect that prompts or steers consults `turnAction` and refuses what the Composer would not offer. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import type { Atom } from 'effect/reactivity';

import type { BackendHarnessSnapshot, SessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { initialBackendHarnessSnapshot, initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { ComposerActionUnavailable, sendChatItemEffect, steerChatItemEffect } from './chat.atoms.ts';
import { HandoffError, promptPinnedSession } from './handoff.atoms.ts';

const launchTarget = 'claude-agent-acp' as const;
const sessionId = 's1';

const steeringInitializeResult = { _meta: { steering: { supported: true } } };
const pendingPermission = { request: {}, resolve: () => undefined } as unknown as SessionSnapshot['pendingPermission'];

/** A fake `FnContext` over one snapshot; `updates` counts harness writes (a Send appends the user message first). */
const makeGet = (
  session: Partial<SessionSnapshot> | undefined,
  initializeResult: unknown = steeringInitializeResult,
) => {
  const snapshot: BackendHarnessSnapshot = {
    ...initialBackendHarnessSnapshot(),
    initializeResult,
    phase: 'ready',
    sessions:
      session === undefined ? {} : { [sessionId]: { ...initialSessionSnapshot(sessionId, 'active'), ...session } },
  };
  const writes = { count: 0 };
  const get = Object.assign(((_atom: unknown) => snapshot) as Atom.FnContext, {
    registry: {
      update: () => {
        writes.count += 1;
      },
    },
  }) as unknown as Atom.FnContext;
  return { get, writes };
};

// Gating failures return before any Agent connection is required.
const steer = (get: Atom.FnContext, text = 'hello') =>
  steerChatItemEffect({ launchTarget, sessionId, text }, get) as Effect.Effect<void, Error>;
const send = (get: Atom.FnContext, text = 'hello') =>
  sendChatItemEffect({ launchTarget, sessionId, text }, get) as unknown as Effect.Effect<void, Error>;
const handoffPrompt = (get: Atom.FnContext, text: string) =>
  promptPinnedSession(launchTarget, get, sessionId, text) as unknown as Effect.Effect<void, HandoffError>;

describe('steerChatItemEffect gating', () => {
  const rejected = (name: string, session: Partial<SessionSnapshot>, text = 'hello', init?: unknown) => {
    it.effect(`fails (so the draft is restored) ${name}`, () =>
      Effect.gen(function* () {
        const { get } = init === undefined ? makeGet(session) : makeGet(session, init);
        const error = yield* Effect.flip(steer(get, text));
        assert.instanceOf(error, ComposerActionUnavailable);
        assert.match(error.message, /Steering is not available/);
      }),
    );
  };

  rejected('when no prompt is in flight', {});
  rejected('when Prompt turn cancel was requested', { pendingClientRequest: 'prompt', promptCancelRequested: true });
  rejected('when the draft is empty', { pendingClientRequest: 'prompt' }, '   ');
  rejected('when the Agent does not advertise Steering supported', { pendingClientRequest: 'prompt' }, 'hello', {});
  rejected('while a Pending interaction waits', { pendingClientRequest: 'prompt', pendingPermission });
});

describe('sendChatItemEffect gating', () => {
  const rejected = (name: string, session: Partial<SessionSnapshot> | undefined, text = 'hello') => {
    it.effect(`fails before appending the user message ${name}`, () =>
      Effect.gen(function* () {
        const { get, writes } = makeGet(session);
        const error = yield* Effect.flip(send(get, text));
        assert.instanceOf(error, ComposerActionUnavailable);
        assert.match(error.message, /Sending is not available/);
        assert.strictEqual(writes.count, 0);
      }),
    );
  };

  rejected('when the Session is missing', undefined);
  rejected('when the Session is not active', { status: 'inactive' });
  rejected('when the draft is empty', {}, '   ');
  rejected('while a prompt is in flight', { pendingClientRequest: 'prompt' });
  rejected('while a config request is pending', { pendingClientRequest: 'config' });
  rejected('while a Pending interaction waits', { pendingPermission });
});

describe('promptPinnedSession (Handoff) gating', () => {
  const rejected = (name: string, session: Partial<SessionSnapshot> | undefined, text: string, message: string) => {
    it.effect(`fails with "${message}" ${name}`, () =>
      Effect.gen(function* () {
        const { get, writes } = makeGet(session);
        const error = yield* Effect.flip(handoffPrompt(get, text));
        assert.instanceOf(error, HandoffError);
        assert.strictEqual(error.message, message);
        assert.strictEqual(writes.count, 0);
      }),
    );
  };

  rejected('when the Session is missing', undefined, 'hand off', 'Session s1 is not active');
  rejected('when the Session is not active', { status: 'inactive' }, 'hand off', 'Session s1 is not active');
  rejected(
    'when not active, ahead of an empty prompt',
    { pendingClientRequest: 'config', status: 'inactive' },
    '',
    'Session s1 is not active',
  );
  rejected('when the prompt is empty', {}, '   ', 'Handoff prompt text is empty');
  rejected(
    'while a prompt is in flight (never Steering)',
    { pendingClientRequest: 'prompt' },
    'hand off',
    'Session s1 cannot accept a prompt right now',
  );
  rejected(
    'while a Pending interaction waits',
    { pendingPermission },
    'hand off',
    'Session s1 cannot accept a prompt right now',
  );
});
