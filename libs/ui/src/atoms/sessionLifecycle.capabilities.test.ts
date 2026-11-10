/** The lifecycle atom fns obey the Agent capabilities the fake Agent advertises in its initialize result. */
import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { Atom } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { SessionSnapshot, SessionStatus } from '../host/acpSessionBootstrap.ts';
import { AgentCapabilityMissing } from '../host/agentCapabilities.ts';
import type { AgentCapability } from '../host/agentCapabilities.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { appendUserChatMessage } from '../host/sessionUpdateReducer.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { advertise, CLAUDE, CODEX, enableProviders, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

const CURSOR = 'cursor-acp' as const;

const sessionCapabilities = (capabilities: Record<string, unknown>) => ({
  agentCapabilities: { sessionCapabilities: capabilities },
});

/** Everything Fork, Archive and Rename need: `sessionCapabilities.fork` plus AIR archive / rename. */
const advertisesForkArchiveRename = {
  _meta: { jetbrains: { air: { capabilities: ['sessionIndex', 'sessionArchive', 'sessionRename'], version: 1 } } },
  ...sessionCapabilities({ fork: {} }),
};

const session = (status: SessionStatus, withTranscript = false): SessionSnapshot => {
  const base = initialSessionSnapshot('s1', status);
  return {
    ...base,
    cwd: '/proj',
    transcript: withTranscript ? appendUserChatMessage(base.transcript, 'hello') : base.transcript,
  };
};

const setup = Effect.fnUntraced(function* (
  initializeResult: unknown,
  options: {
    readonly fake?: FakeAgentOpts;
    readonly launchTarget?: AgentLaunchTarget;
    readonly session?: SessionSnapshot;
  } = {},
) {
  const launchTarget = options.launchTarget ?? CODEX;
  const calls: string[] = [];
  const registry = yield* freshRegistry;
  enableProviders(registry, [CLAUDE, CODEX, CURSOR]);
  yield* installFakeAgent(calls, options.fake, launchTarget);
  const runtime = createHostRuntime(mockHostLayer);
  const { cancelPromptAtomFn } = createChatAtoms(runtime);
  const { refreshSessionFsListingAtomFn } = createSessionFsListingAtoms(runtime, Atom.make<readonly string[]>([]));
  const atoms = createSessionLifecycleAtoms(runtime, refreshSessionFsListingAtomFn, cancelPromptAtomFn);
  updateHarnessSnapshot(registry, launchTarget, current => ({
    ...current,
    sessionHistory: [{ cwd: '/proj', sessionId: 's1', title: 'Old' }],
    sessions: options.session === undefined ? current.sessions : { s1: options.session },
  }));
  advertise(registry, launchTarget, initializeResult);
  const snapshot = () => registry.get(backendHarnessSnapshotAtom(launchTarget));
  const target = { launchTarget, sessionId: 's1' };
  return { atoms, calls, registry, snapshot, target };
});

type Setup = Effect.Success<ReturnType<typeof setup>>;

const refusable: readonly {
  readonly capability: AgentCapability;
  readonly expectedCalls: readonly string[];
  readonly name: string;
  readonly run: (s: Setup) => Effect.Effect<unknown, unknown>;
}[] = [
  {
    capability: 'sessionFork',
    expectedCalls: ['fork:s1', 'load:fork-1'],
    name: 'Fork',
    run: ({ atoms, registry, target }) => runAtomFn(registry, atoms.forkSessionAtomFn, { ...target, cwd: '/proj' }),
  },
  {
    capability: 'sessionArchive',
    expectedCalls: ['archive:s1'],
    name: 'Archive',
    run: ({ atoms, registry, target }) => runAtomFn(registry, atoms.archiveSessionAtomFn, target),
  },
  {
    capability: 'sessionRename',
    expectedCalls: ['rename:s1'],
    name: 'Rename',
    run: ({ atoms, registry, target }) => runAtomFn(registry, atoms.renameSessionAtomFn, { ...target, title: 'New' }),
  },
];

describe('Fork, Archive and Rename obey the Agent capabilities', () => {
  for (const { capability, expectedCalls, name, run } of refusable) {
    it.effect(`${name} is refused without ${capability}: no RPC, snapshot untouched`, () =>
      Effect.gen(function* () {
        const s = yield* setup({});
        const before = s.snapshot();
        const error = yield* Effect.flip(run(s));
        assert.instanceOf(error, AgentCapabilityMissing);
        assert.strictEqual(error.capability, capability);
        assert.deepStrictEqual(s.calls, []);
        assert.deepStrictEqual(s.snapshot().sessionHistory, before.sessionHistory);
        assert.deepStrictEqual(s.snapshot().sessions, before.sessions);
      }).pipe(Effect.scoped),
    );

    it.effect(`${name} runs when ${capability} is advertised`, () =>
      Effect.gen(function* () {
        const s = yield* setup(advertisesForkArchiveRename);
        yield* run(s);
        assert.includeMembers(s.calls, [...expectedCalls]);
      }).pipe(Effect.scoped),
    );
  }
});

describe('Deactivate and delete close fail-closed only when close is advertised', () => {
  it.effect('Deactivate fails when an advertised close fails; the Session stays active', () =>
    Effect.gen(function* () {
      const s = yield* setup(sessionCapabilities({ close: {} }), {
        fake: { failClose: true },
        session: session('active'),
      });
      const exit = yield* Effect.exit(runAtomFn(s.registry, s.atoms.deactivateSessionAtomFn, s.target));
      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(s.calls, ['close:s1']);
      assert.strictEqual(s.snapshot().sessions.s1.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('Deactivate attempts a close that is not advertised and ignores its failure', () =>
    Effect.gen(function* () {
      const s = yield* setup({}, { fake: { failClose: true }, session: session('active') });
      yield* runAtomFn(s.registry, s.atoms.deactivateSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['close:s1']);
      assert.strictEqual(s.snapshot().sessions.s1.status, 'inactive');
    }).pipe(Effect.scoped),
  );

  it.effect('Delete of an active Session goes ahead when an unadvertised close fails', () =>
    Effect.gen(function* () {
      const s = yield* setup({}, { fake: { failClose: true }, session: session('active') });
      yield* runAtomFn(s.registry, s.atoms.deleteSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['close:s1', 'delete:s1']);
      assert.notProperty(s.snapshot().sessions, 's1');
    }).pipe(Effect.scoped),
  );

  it.effect(
    'Delete of an active Session stops the RPC when an advertised close fails, but the Session is already gone',
    () =>
      Effect.gen(function* () {
        const s = yield* setup(sessionCapabilities({ close: {} }), {
          fake: { failClose: true },
          session: session('active'),
        });
        const exit = yield* Effect.exit(runAtomFn(s.registry, s.atoms.deleteSessionAtomFn, s.target));
        assert.isTrue(Exit.isFailure(exit));
        assert.deepStrictEqual(s.calls, ['close:s1']);
        assert.notProperty(s.snapshot().sessions, 's1');
      }).pipe(Effect.scoped),
  );

  it.effect('Delete is optimistic: a failed session/delete still leaves the History entry and Session dropped', () =>
    Effect.gen(function* () {
      const s = yield* setup({}, { fake: { failDelete: true }, session: session('active') });
      const exit = yield* Effect.exit(runAtomFn(s.registry, s.atoms.deleteSessionAtomFn, s.target));
      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(s.calls, ['close:s1', 'delete:s1']);
      assert.notProperty(s.snapshot().sessions, 's1');
      assert.isUndefined(s.snapshot().sessionHistory.find(entry => entry.sessionId === 's1'));
    }).pipe(Effect.scoped),
  );
});

describe('Activate resumes only when the Agent capabilities allow it', () => {
  const resume = sessionCapabilities({ resume: {} });
  const activate = (s: Setup) => runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);

  const cases: readonly {
    readonly expected: string;
    readonly initializeResult: unknown;
    readonly launchTarget: AgentLaunchTarget;
    readonly name: string;
    readonly withTranscript: boolean;
  }[] = [
    {
      expected: 'resume:s1',
      initializeResult: resume,
      launchTarget: CODEX,
      name: 'resume advertised, local transcript → session/resume',
      withTranscript: true,
    },
    {
      expected: 'load:s1',
      initializeResult: resume,
      launchTarget: CURSOR,
      name: 'Cursor advertising resume, local transcript → session/load',
      withTranscript: true,
    },
    {
      expected: 'load:s1',
      initializeResult: {},
      launchTarget: CODEX,
      name: 'resume not advertised, local transcript → session/load',
      withTranscript: true,
    },
    {
      expected: 'load:s1',
      initializeResult: resume,
      launchTarget: CODEX,
      name: 'resume advertised, empty transcript → session/load',
      withTranscript: false,
    },
  ];

  for (const { expected, initializeResult, launchTarget, name, withTranscript } of cases) {
    it.effect(name, () =>
      Effect.gen(function* () {
        const s = yield* setup(initializeResult, { launchTarget, session: session('inactive', withTranscript) });
        yield* activate(s);
        assert.deepStrictEqual(
          s.calls.filter(call => call.startsWith('load:') || call.startsWith('resume:')),
          [expected],
        );
      }).pipe(Effect.scoped),
    );
  }
});
