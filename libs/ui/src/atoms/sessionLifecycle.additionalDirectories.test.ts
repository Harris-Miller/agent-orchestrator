/** Activate and Fork carry a Session's Additional directories to the Agent, only when it advertises the capability. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { HistoryEntry, SessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { appendUserChatMessage } from '../host/sessionUpdateReducer.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import type { SessionRequest } from './fakeAgent.testing.ts';
import { advertise, CODEX, enableProviders, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.testing.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import { workspaceFolderPathsAtom } from './workspaceFolderPaths.atoms.ts';

const FROM_HISTORY = ['/hist/a', '/hist/b'];
const FROM_SNAPSHOT = ['/snap/a'];
const WORKSPACE = '/proj/app.code-workspace';

const advertises = (...capabilities: readonly string[]) => ({
  agentCapabilities: {
    sessionCapabilities: Object.fromEntries(capabilities.map(capability => [capability, {}])),
  },
});

const setup = Effect.fnUntraced(function* (options: {
  readonly capable: boolean;
  readonly history?: Partial<HistoryEntry>;
  readonly initialize?: unknown;
  readonly session?: Partial<SessionSnapshot>;
}) {
  const requests: SessionRequest[] = [];
  const calls: string[] = [];
  const registry = yield* freshRegistry;
  enableProviders(registry, [CODEX]);
  yield* installFakeAgent(calls, { additionalDirectories: options.capable, requests });
  const atoms = createSessionLifecycleAtoms(createHostRuntime(mockHostLayer), () => Effect.void);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [{ cwd: '/proj', sessionId: 's1', ...options.history }],
    sessions:
      options.session === undefined
        ? current.sessions
        : { s1: { ...initialSessionSnapshot('s1', 'inactive'), cwd: '/proj', ...options.session } },
  }));
  advertise(registry, CODEX, options.initialize ?? advertises('fork'));
  const snapshot = () => registry.get(backendHarnessSnapshotAtom(CODEX));
  return { atoms, calls, registry, requests, snapshot, target: { launchTarget: CODEX, sessionId: 's1' } };
});

describe('Activate in a multi-root workspace', () => {
  it.effect('sends the recorded list, not the current Workspace folders', () =>
    Effect.gen(function* () {
      const s = yield* setup({ capable: true, history: { additionalDirectories: FROM_HISTORY } });
      s.registry.set(workspaceFolderPathsAtom, ['/proj', '/ws/x', '/ws/y']);
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);

      assert.deepStrictEqual(s.requests[0].params.additionalDirectories, FROM_HISTORY);
    }).pipe(Effect.scoped),
  );

  it.effect('a record without directories sends none', () =>
    Effect.gen(function* () {
      const s = yield* setup({ capable: true });
      s.registry.set(workspaceFolderPathsAtom, ['/proj', '/ws/x', '/ws/y']);
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);

      assert.isFalse('additionalDirectories' in s.requests[0].params);
    }).pipe(Effect.scoped),
  );
});

describe('Activate', () => {
  it.effect('sends the History entry list via session/load when the Agent is capable', () =>
    Effect.gen(function* () {
      const s = yield* setup({ capable: true, history: { additionalDirectories: FROM_HISTORY } });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);

      assert.deepStrictEqual(
        s.requests.map(({ params, rpc }) => [rpc, params.additionalDirectories]),
        [['load', FROM_HISTORY]],
      );
      assert.deepStrictEqual(s.snapshot().sessions.s1.additionalDirectories, FROM_HISTORY);
    }).pipe(Effect.scoped),
  );

  it.effect('prefers the snapshot Session list over the History entry', () =>
    Effect.gen(function* () {
      const s = yield* setup({
        capable: true,
        history: { additionalDirectories: FROM_HISTORY },
        session: { additionalDirectories: FROM_SNAPSHOT },
      });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);

      assert.deepStrictEqual(s.requests[0].params.additionalDirectories, FROM_SNAPSHOT);
    }).pipe(Effect.scoped),
  );

  it.effect('sends the list via session/resume when the Session has history and resume is advertised', () =>
    Effect.gen(function* () {
      const s = yield* setup({
        capable: true,
        history: { additionalDirectories: FROM_HISTORY },
        initialize: advertises('resume'),
        session: { transcript: appendUserChatMessage(initialSessionSnapshot('s1', 'inactive').transcript, 'hi') },
      });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);

      assert.deepStrictEqual(
        s.requests.map(({ params, rpc }) => [rpc, params.additionalDirectories]),
        [['resume', FROM_HISTORY]],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('never sends the list to an Agent that is not capable, and a record without one sends none', () =>
    Effect.gen(function* () {
      const incapable = yield* setup({ capable: false, history: { additionalDirectories: FROM_HISTORY } });
      yield* runAtomFn(incapable.registry, incapable.atoms.activateSessionAtomFn, incapable.target);
      assert.isFalse('additionalDirectories' in incapable.requests[0].params);

      const plain = yield* setup({ capable: true });
      yield* runAtomFn(plain.registry, plain.atoms.activateSessionAtomFn, plain.target);
      assert.isFalse('additionalDirectories' in plain.requests[0].params);
    }).pipe(Effect.scoped),
  );
});

describe('Fork', () => {
  it.effect('sends the source list on session/fork; the fork entry, then its Activate, inherit it', () =>
    Effect.gen(function* () {
      const s = yield* setup({
        capable: true,
        history: { additionalDirectories: FROM_HISTORY, workspaceFile: WORKSPACE },
      });
      yield* runAtomFn(s.registry, s.atoms.forkSessionAtomFn, { ...s.target, cwd: '/proj' });

      assert.deepStrictEqual(
        s.requests.map(({ params, rpc }) => [rpc, params.additionalDirectories]),
        [
          ['fork', FROM_HISTORY],
          ['load', FROM_HISTORY],
        ],
      );
      const forked = s.snapshot().sessionHistory.find(entry => entry.sessionId === 'fork-1');
      assert.deepStrictEqual(forked?.additionalDirectories, FROM_HISTORY);
      assert.strictEqual(forked?.workspaceFile, WORKSPACE);
      assert.isFalse('workspaceFile' in s.requests[0].params);
    }).pipe(Effect.scoped),
  );

  it.effect('omits the list on the wire when not capable, but the fork still carries it', () =>
    Effect.gen(function* () {
      const s = yield* setup({ capable: false, history: { additionalDirectories: FROM_HISTORY } });
      yield* runAtomFn(s.registry, s.atoms.forkSessionAtomFn, { ...s.target, cwd: '/proj' });

      for (const { params } of s.requests) {
        assert.isFalse('additionalDirectories' in params);
      }
      const forked = s.snapshot().sessionHistory.find(entry => entry.sessionId === 'fork-1');
      assert.deepStrictEqual(forked?.additionalDirectories, FROM_HISTORY);
    }).pipe(Effect.scoped),
  );
});
