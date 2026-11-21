/** The lifecycle atom fns obey the Agent capabilities the fake Agent advertises in its initialize result. */
import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { SessionSnapshot, SessionStatus } from '../host/acpSessionBootstrap.ts';
import { AgentCapabilityMissing } from '../host/agentCapabilities.ts';
import type { AgentCapability } from '../host/agentCapabilities.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { appendUserChatMessage, reduceSessionUpdate } from '../host/sessionUpdateReducer.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { advertise, CLAUDE, CODEX, enableProviders, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
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
  const atoms = createSessionLifecycleAtoms(runtime, cancelPromptAtomFn, () => Effect.void);
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
  /** Archive is never refused: its agent-side call is best-effort, the flag flips locally. */
  readonly refused: boolean;
  readonly run: (s: Setup) => Effect.Effect<unknown, unknown>;
}[] = [
  {
    capability: 'sessionFork',
    expectedCalls: ['fork:s1', 'load:fork-1'],
    name: 'Fork',
    refused: true,
    run: ({ atoms, registry, target }) => runAtomFn(registry, atoms.forkSessionAtomFn, { ...target, cwd: '/proj' }),
  },
  {
    capability: 'sessionArchive',
    expectedCalls: ['archive:s1'],
    name: 'Archive',
    refused: false,
    run: ({ atoms, registry, target }) => runAtomFn(registry, atoms.archiveSessionAtomFn, target),
  },
  {
    capability: 'sessionRename',
    expectedCalls: ['rename:s1'],
    name: 'Rename',
    refused: true,
    run: ({ atoms, registry, target }) => runAtomFn(registry, atoms.renameSessionAtomFn, { ...target, title: 'New' }),
  },
];

describe('Fork, Archive and Rename obey the Agent capabilities', () => {
  for (const { capability, expectedCalls, name, refused, run } of refusable) {
    if (refused) {
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
    }

    it.effect(`${name} runs when ${capability} is advertised`, () =>
      Effect.gen(function* () {
        const s = yield* setup(advertisesForkArchiveRename);
        yield* run(s);
        assert.includeMembers(s.calls, [...expectedCalls]);
      }).pipe(Effect.scoped),
    );
  }
});

describe('Deactivate fails on an advertised close that fails; Delete always untracks', () => {
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

  it.effect('Delete deletes on the agent after a best-effort close where session/delete is advertised', () =>
    Effect.gen(function* () {
      const s = yield* setup(sessionCapabilities({ delete: {} }), {
        fake: { failClose: true },
        session: session('active'),
      });
      yield* runAtomFn(s.registry, s.atoms.deleteSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['close:s1', 'delete:s1']);
      assert.notProperty(s.snapshot().sessions, 's1');
      assert.isUndefined(s.snapshot().sessionHistory.find(entry => entry.sessionId === 's1'));
    }).pipe(Effect.scoped),
  );

  it.effect('Delete only untracks where session/delete is not advertised: no RPC', () =>
    Effect.gen(function* () {
      const s = yield* setup({}, { session: session('active') });
      yield* runAtomFn(s.registry, s.atoms.deleteSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, []);
      assert.notProperty(s.snapshot().sessions, 's1');
      assert.isUndefined(s.snapshot().sessionHistory.find(entry => entry.sessionId === 's1'));
    }).pipe(Effect.scoped),
  );

  it.effect('a failed session/delete is raised, but the session is untracked regardless', () =>
    Effect.gen(function* () {
      const s = yield* setup(sessionCapabilities({ delete: {} }), {
        fake: { failDelete: true },
        session: session('active'),
      });
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

describe('#278 F5: no-resume session/load replays into a clean transcript', () => {
  const replayed = (messageId: string | undefined) => {
    const id = messageId === undefined ? {} : { messageId };
    return [
      { ...id, content: { text: 'hello', type: 'text' }, sessionUpdate: 'user_message_chunk' },
      { ...id, content: { text: 'hi there', type: 'text' }, sessionUpdate: 'agent_message_chunk' },
    ] as const;
  };

  const replayCases = [
    { ids: ['u1', 'a1'], name: 'stable message IDs' },
    { ids: [undefined, undefined], name: 'omitted message IDs' },
  ] as const;

  for (const { ids, name } of replayCases) {
    it.effect(`activate twice with ${name}: one copy of the exchange each time`, () =>
      Effect.gen(function* () {
        const calls: string[] = [];
        const registry = yield* freshRegistry;
        enableProviders(registry, [CLAUDE, CODEX, CURSOR]);
        const fold = makeHarnessEventFold({
          setModelPickerPrefs: () => undefined,
          launchTarget: CODEX,
          registry,
          runFork: () => undefined,
        });
        const [user] = replayed(ids[0]);
        const [, agent] = replayed(ids[1]);
        yield* installFakeAgent(
          calls,
          {
            duringLoad: Effect.sync(() => {
              fold.onSessionUpdate('s1', user);
              fold.onSessionUpdate('s1', agent);
            }),
          },
          CODEX,
        );
        const runtime = createHostRuntime(mockHostLayer);
        const { cancelPromptAtomFn } = createChatAtoms(runtime);
        const atoms = createSessionLifecycleAtoms(runtime, cancelPromptAtomFn, () => Effect.void);
        // Local transcript already holds the same exchange (user + agent), as after a completed turn.
        const base = session('inactive');
        let { transcript } = base;
        transcript = reduceSessionUpdate(transcript, user);
        transcript = reduceSessionUpdate(transcript, agent);
        updateHarnessSnapshot(registry, CODEX, current => ({
          ...current,
          sessionHistory: [{ cwd: '/proj', sessionId: 's1', title: 'Old' }],
          sessions: { s1: { ...base, transcript } },
        }));
        advertise(registry, CODEX, {});
        const target = { launchTarget: CODEX, sessionId: 's1' } as const;
        const texts = () =>
          registry
            .get(backendHarnessSnapshotAtom(CODEX))
            .sessions.s1.transcript.items.map(item => `${item.kind}:${'text' in item ? item.text : ''}`);

        yield* runAtomFn(registry, atoms.activateSessionAtomFn, target);
        assert.deepStrictEqual(calls, ['load:s1']);
        assert.deepStrictEqual(texts(), ['user_message:hello', 'agent_message:hi there']);

        yield* runAtomFn(registry, atoms.deactivateSessionAtomFn, target);
        yield* runAtomFn(registry, atoms.activateSessionAtomFn, target);
        assert.deepStrictEqual(texts(), ['user_message:hello', 'agent_message:hi there']);
      }).pipe(Effect.scoped),
    );
  }
});
