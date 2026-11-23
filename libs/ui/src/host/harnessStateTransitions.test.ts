import { assert, describe, it } from '@effect/vitest';

import {
  initialBackendHarnessSnapshot,
  initialSessionSnapshot,
  normalizeConfigOptions,
} from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot, SessionSnapshot } from './acpSessionBootstrap.ts';
import { agentCapabilitiesFrom, NO_AGENT_CAPABILITIES } from './agentCapabilities.ts';
import { configValue } from './sessionConfiguration.ts';
import {
  addCreatedSession,
  answerElicitation,
  answerPermission,
  appendSteeredMessage,
  applyBootstrapPhase,
  applyConfigResult,
  applyInitializeResult,
  applyLoadedConfiguration,
  beginActivation,
  beginConfigChange,
  beginPromptTurn,
  bindSession,
  dropSession,
  dropSessionIfPresent,
  endClientRequest,
  endConfigChange,
  endPromptTurn,
  failActivation,
  failUnarchive,
  finishActivation,
  markActivationCwdMissing,
  markHistoryUnavailable,
  markSessionInactive,
  projectChildOnto,
  raiseElicitation,
  raisePermission,
  reconcileConnectionLost,
  replaceSessionHistory,
  requestPromptCancel,
  restoreSubagentFromResult,
  setAntigravityAuthUrl,
  stripSessionPendings,
  upsertIntoSnapshot,
} from './harnessStateTransitions.ts';
import { appendUserChatMessage } from './sessionUpdateReducer.ts';
import { initialSpawnedSubagentSnapshot } from './subagent.ts';

describe('markHistoryUnavailable', () => {
  const current = [
    { cwd: '/a', sessionId: 'a' },
    { cwd: '/b', sessionId: 'b' },
  ];
  it('marks hydrated entries unavailable', () => {
    assert.deepStrictEqual(
      markHistoryUnavailable(current),
      current.map(entry => ({ ...entry, unavailable: true })),
    );
  });
});

const readySnapshot = (sessions: Readonly<Record<string, SessionSnapshot>> = {}): BackendHarnessSnapshot => ({
  ...initialBackendHarnessSnapshot(),
  phase: 'ready',
  sessions,
});

const activeSession = (sessionId: string, overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  ...initialSessionSnapshot(sessionId, 'active'),
  ...overrides,
  sessionId,
});

const modelOption = (currentValue: string | undefined) =>
  normalizeConfigOptions({
    configOptions: [
      {
        currentValue,
        id: 'model',
        name: 'Model',
        options: [
          { name: 'gpt', value: 'gpt' },
          { name: 'o1', value: 'o1' },
          { name: 'gpt-5', value: 'gpt-5' },
        ],
        type: 'select',
      },
    ],
  });

const modelToO1 = { configId: 'model', type: 'select', value: 'o1' } as const;

describe('beginConfigChange', () => {
  const refusedFor = (snapshot: BackendHarnessSnapshot) => beginConfigChange(snapshot, 's1', modelToO1)._tag;

  it('refuses when Bootstrap is not usable, the Session is inactive, or a client request or elicitation is pending', () => {
    const configuration = modelOption('gpt');
    assert.strictEqual(
      refusedFor({ ...readySnapshot({ s1: activeSession('s1', { configuration }) }), phase: 'connecting' }),
      'Refused',
    );
    assert.strictEqual(
      refusedFor(readySnapshot({ s1: { ...initialSessionSnapshot('s1', 'inactive'), configuration } })),
      'Refused',
    );
    assert.strictEqual(
      refusedFor(readySnapshot({ s1: activeSession('s1', { configuration, pendingClientRequest: 'config' }) })),
      'Refused',
    );
    assert.strictEqual(
      refusedFor(
        readySnapshot({
          s1: activeSession('s1', {
            configuration,
            pendingElicitation: { id: 'e1', request: {} as never, resolve: () => undefined, sessionId: 's1' },
          }),
        }),
      ),
      'Refused',
    );
  });

  it('refuses without changing anything, reporting the decided action', () => {
    const snapshot = readySnapshot({
      s1: activeSession('s1', { configuration: modelOption('gpt'), pendingClientRequest: 'prompt' }),
    });
    assert.deepStrictEqual(beginConfigChange(snapshot, 's1', modelToO1), {
      _tag: 'Refused',
      action: { _tag: 'CancelTurn' },
    });
  });

  it('begins in one snapshot: Pending client request config and the new value, with the previous value', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1', { configuration: modelOption('gpt') }) });
    const begun = beginConfigChange(snapshot, 's1', modelToO1);
    assert.strictEqual(begun._tag, 'Begun');
    if (begun._tag !== 'Begun') return;
    assert.strictEqual(begun.previous, 'gpt');
    assert.strictEqual(begun.snapshot.sessions.s1.pendingClientRequest, 'config');
    assert.strictEqual(configValue(begun.snapshot.sessions.s1.configuration, 'model'), 'o1');
  });

  it('is Unchanged when the option already holds the value, even with a Pending client request', () => {
    const snapshot = readySnapshot({
      s1: activeSession('s1', { configuration: modelOption('o1'), pendingClientRequest: 'prompt' }),
    });
    assert.deepStrictEqual(beginConfigChange(snapshot, 's1', modelToO1), { _tag: 'Unchanged' });
  });
});

describe('endConfigChange', () => {
  const inFlight = (model: string) =>
    readySnapshot({
      s1: activeSession('s1', {
        configuration: modelOption(model),
        pendingClientRequest: 'config',
        promptCancelRequested: true,
      }),
    });

  it('reverts the option while it still holds the value the change wrote, and clears the request', () => {
    const next = endConfigChange(inFlight('o1'), 's1', { change: modelToO1, previous: 'gpt' });
    assert.strictEqual(configValue(next.sessions.s1.configuration, 'model'), 'gpt');
    assert.isUndefined(next.sessions.s1.pendingClientRequest);
    assert.isUndefined(next.sessions.s1.promptCancelRequested);
  });

  it('leaves a newer value alone', () => {
    const next = endConfigChange(inFlight('gpt-5'), 's1', { change: modelToO1, previous: 'gpt' });
    assert.strictEqual(configValue(next.sessions.s1.configuration, 'model'), 'gpt-5');
    assert.isUndefined(next.sessions.s1.pendingClientRequest);
  });

  it('without a revert only clears the request', () => {
    const next = endConfigChange(inFlight('o1'), 's1');
    assert.strictEqual(configValue(next.sessions.s1.configuration, 'model'), 'o1');
    assert.isUndefined(next.sessions.s1.pendingClientRequest);
  });

  it('leaves a Session that is no longer in the map dropped (end and response fold)', () => {
    const snapshot = readySnapshot();
    assert.strictEqual(endConfigChange(snapshot, 's1', { change: modelToO1, previous: 'gpt' }), snapshot);
    assert.strictEqual(applyConfigResult(snapshot, 's1', modelToO1, { configOptions: [] }), snapshot);
  });
});

describe('applyConfigResult', () => {
  it('writes the value, then folds the response into the latest configuration', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1', { configuration: modelOption('gpt') }) });
    const next = applyConfigResult(snapshot, 's1', modelToO1, {
      configOptions: [{ id: 'model', type: 'select' }],
    });
    assert.deepStrictEqual(next.sessions.s1.configuration, modelOption('o1'));
  });
});

describe('endClientRequest', () => {
  it('clears pendingClientRequest and promptCancelRequested', () => {
    const snapshot = readySnapshot({
      s1: activeSession('s1', { pendingClientRequest: 'prompt', promptCancelRequested: true }),
    });
    const next = endClientRequest(snapshot, 's1');
    assert.isUndefined(next.sessions.s1.pendingClientRequest);
    assert.isUndefined(next.sessions.s1.promptCancelRequested);
  });

  it('leaves a Session that is no longer in the map dropped', () => {
    const snapshot = readySnapshot();
    assert.strictEqual(endClientRequest(snapshot, 's1'), snapshot);
  });
});

describe('beginPromptTurn', () => {
  it('refuses with the decided action when Bootstrap is not usable', () => {
    const snapshot: BackendHarnessSnapshot = { ...readySnapshot({ s1: activeSession('s1') }), phase: 'initialized' };
    assert.deepStrictEqual(beginPromptTurn(snapshot, 's1', { startedAt: 1, text: 'hi' }), {
      _tag: 'Refused',
      action: { _tag: 'Unavailable', reason: 'NotReady' },
    });
  });

  it('refuses with CancelTurn while a prompt is in flight (a Send never sees Steer)', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1', { pendingClientRequest: 'prompt' }) });
    assert.deepStrictEqual(beginPromptTurn(snapshot, 's1', { startedAt: 1, text: 'hi' }), {
      _tag: 'Refused',
      action: { _tag: 'CancelTurn' },
    });
  });

  it('refuses an empty prompt', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    assert.deepStrictEqual(beginPromptTurn(snapshot, 's1', { startedAt: 1, text: '' }), {
      _tag: 'Refused',
      action: { _tag: 'Unavailable', reason: 'Empty' },
    });
  });

  it('sets the Pending client request and appends the user message stamped startedAt', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const begun = beginPromptTurn(snapshot, 's1', { startedAt: 42, text: 'hello' });
    assert.strictEqual(begun._tag, 'Begun');
    if (begun._tag !== 'Begun') return;
    const session = begun.snapshot.sessions.s1;
    assert.strictEqual(session.pendingClientRequest, 'prompt');
    assert.deepStrictEqual(session.transcript.items, [
      { id: begun.turnId, kind: 'user_message', startedAt: 42, text: 'hello' },
    ]);
  });
});

describe('endPromptTurn', () => {
  it('clears the request and Prompt turn cancel, and stamps endedAt only on its own turn', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const first = beginPromptTurn(snapshot, 's1', { startedAt: 1, text: 'one' });
    assert.strictEqual(first._tag, 'Begun');
    if (first._tag !== 'Begun') return;
    const ended = endPromptTurn(first.snapshot, 's1', first.turnId, 5);
    const second = beginPromptTurn(ended, 's1', { startedAt: 6, text: 'two' });
    assert.strictEqual(second._tag, 'Begun');
    if (second._tag !== 'Begun') return;
    const cancelling: BackendHarnessSnapshot = {
      ...second.snapshot,
      sessions: { s1: { ...second.snapshot.sessions.s1, promptCancelRequested: true } },
    };
    const next = endPromptTurn(cancelling, 's1', second.turnId, 9).sessions.s1;
    assert.isUndefined(next.pendingClientRequest);
    assert.isUndefined(next.promptCancelRequested);
    assert.deepStrictEqual(
      next.transcript.items.map(item => (item.kind === 'user_message' ? [item.startedAt, item.endedAt] : [])),
      [
        [1, 5],
        [6, 9],
      ],
    );
  });

  it('advances the History updatedAt to the turn end, also for a cancelled turn', () => {
    const snapshot: BackendHarnessSnapshot = {
      ...readySnapshot({ s1: activeSession('s1') }),
      sessionHistory: [
        { cwd: '/proj', sessionId: 's1', updatedAt: '2020-01-01T00:00:00.000Z' },
        { cwd: '/proj', sessionId: 's2', updatedAt: '2020-01-01T00:00:00.000Z' },
      ],
    };
    const begun = beginPromptTurn(snapshot, 's1', { startedAt: 1, text: 'one' });
    assert.strictEqual(begun._tag, 'Begun');
    if (begun._tag !== 'Begun') return;
    const cancelling: BackendHarnessSnapshot = {
      ...begun.snapshot,
      sessions: { s1: { ...begun.snapshot.sessions.s1, promptCancelRequested: true } },
    };
    const ended = endPromptTurn(cancelling, 's1', begun.turnId, 1_700_000_000_000);
    assert.deepStrictEqual(
      ended.sessionHistory.map(entry => entry.updatedAt),
      ['2023-11-14T22:13:20.000Z', '2020-01-01T00:00:00.000Z'],
    );
  });

  it('advances an existing Last prompt time to the turn end, never backwards, and never adds one', () => {
    const prompted = (lastPromptTime: string) => ({ lastPromptTime });
    const snapshot: BackendHarnessSnapshot = {
      ...readySnapshot({ s1: activeSession('s1') }),
      sessionHistory: [
        {
          cwd: '/proj',
          sessionId: 's1',
          updatedAt: '2020-01-01T00:00:00.000Z',
          ...prompted('2020-01-01T00:00:00.000Z'),
        },
        { cwd: '/proj', sessionId: 's2', updatedAt: '2020-01-01T00:00:00.000Z' },
      ],
    };
    const begun = beginPromptTurn(snapshot, 's1', { startedAt: 1, text: 'one' });
    assert.strictEqual(begun._tag, 'Begun');
    if (begun._tag !== 'Begun') return;
    const ended = endPromptTurn(begun.snapshot, 's1', begun.turnId, 1_700_000_000_000);
    assert.strictEqual(ended.sessionHistory[0].lastPromptTime, '2023-11-14T22:13:20.000Z');
    const future: BackendHarnessSnapshot = {
      ...begun.snapshot,
      sessionHistory: [{ cwd: '/proj', sessionId: 's1', ...prompted('2099-01-01T00:00:00.000Z') }],
    };
    assert.deepStrictEqual(
      endPromptTurn(future, 's1', begun.turnId, 1_700_000_000_000).sessionHistory[0].lastPromptTime,
      '2099-01-01T00:00:00.000Z',
    );
    const noMeta = endPromptTurn(
      { ...begun.snapshot, sessionHistory: [{ cwd: '/proj', sessionId: 's1' }] },
      's1',
      begun.turnId,
      1_700_000_000_000,
    );
    assert.isUndefined(noMeta.sessionHistory[0].lastPromptTime);
  });

  it('drops a running / requires_action Activity state on turn end, keeping error and the rest of _meta', () => {
    const rowWith = (state?: string) => ({
      _meta: { jetbrains: { air: { model: 'm', ...(state === undefined ? {} : { state }) } }, other: 1 },
      cwd: '/proj',
      sessionId: 's1',
    });
    const afterEnd = (state?: string) => {
      const snapshot: BackendHarnessSnapshot = {
        ...readySnapshot({ s1: activeSession('s1') }),
        sessionHistory: [rowWith(state)],
      };
      const begun = beginPromptTurn(snapshot, 's1', { startedAt: 1, text: 'one' });
      assert.strictEqual(begun._tag, 'Begun');
      if (begun._tag !== 'Begun') return undefined;
      return endPromptTurn(begun.snapshot, 's1', begun.turnId, 9).sessionHistory[0]._meta;
    };
    assert.deepStrictEqual(afterEnd('running'), rowWith()._meta);
    assert.deepStrictEqual(afterEnd('requires_action'), rowWith()._meta);
    assert.deepStrictEqual(afterEnd('error'), rowWith('error')._meta);
    assert.deepStrictEqual(afterEnd(), rowWith()._meta);
  });

  it('leaves the History unchanged when the Session has no History row', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const begun = beginPromptTurn(snapshot, 's1', { startedAt: 1, text: 'one' });
    assert.strictEqual(begun._tag, 'Begun');
    if (begun._tag !== 'Begun') return;
    assert.deepStrictEqual(endPromptTurn(begun.snapshot, 's1', begun.turnId, 9).sessionHistory, []);
  });

  it('leaves a Session that is no longer in the map dropped', () => {
    const snapshot = readySnapshot();
    assert.strictEqual(endPromptTurn(snapshot, 's1', 'turn', 9), snapshot);
  });
});

describe('stripSessionPendings', () => {
  it('only clears pendings on listed session ids', () => {
    const snapshot = readySnapshot({
      s1: activeSession('s1', { pendingClientRequest: 'prompt' }),
      s2: activeSession('s2', { pendingClientRequest: 'config' }),
    });
    const next = stripSessionPendings(snapshot, ['s1']);
    assert.isUndefined(next.sessions.s1.pendingClientRequest);
    assert.strictEqual(next.sessions.s2.pendingClientRequest, 'config');
  });
});

describe('markSessionInactive', () => {
  it('sets status inactive', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const next = markSessionInactive(snapshot, 's1');
    assert.strictEqual(next.sessions.s1.status, 'inactive');
  });
  it('clears pending client request but keeps prompt cancel flag', () => {
    const snapshot = readySnapshot({
      s1: activeSession('s1', { pendingClientRequest: 'prompt', promptCancelRequested: true }),
    });
    const next = markSessionInactive(snapshot, 's1');
    assert.isUndefined(next.sessions.s1.pendingClientRequest);
    assert.isTrue(next.sessions.s1.promptCancelRequested);
  });
});

describe('dropSession', () => {
  it('removes session and history row', () => {
    const snapshot: BackendHarnessSnapshot = {
      ...readySnapshot({ s1: activeSession('s1'), s2: activeSession('s2') }),
      sessionHistory: [
        { cwd: '/a', sessionId: 's1' },
        { cwd: '/b', sessionId: 's2' },
      ],
    };
    const next = dropSession(snapshot, 's1');
    assert.isUndefined(next.sessions.s1);
    assert.isDefined(next.sessions.s2);
    assert.deepStrictEqual(
      next.sessionHistory.map(entry => entry.sessionId),
      ['s2'],
    );
  });
});

describe('upsertIntoSnapshot', () => {
  it('upserts session and optional history entry', () => {
    const session = activeSession('s1', { cwd: '/proj' });
    const historyEntry = { cwd: '/proj', sessionId: 's1', title: 'T' };
    const next = upsertIntoSnapshot(readySnapshot(), { historyEntry, session });
    assert.strictEqual(next.sessions.s1.cwd, '/proj');
    assert.strictEqual(next.sessionHistory[0]?.sessionId, 's1');
    assert.strictEqual(next.sessionHistory[0]?.title, 'T');
  });

  it('upserts history entry alone', () => {
    const historyEntry = { cwd: '/proj', sessionId: 's1' };
    const next = upsertIntoSnapshot(readySnapshot(), { historyEntry });
    assert.strictEqual(Object.keys(next.sessions).length, 0);
    assert.strictEqual(next.sessionHistory[0]?.sessionId, 's1');
  });
});

describe('replaceSessionHistory', () => {
  it('replaces history only', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const next = replaceSessionHistory(snapshot, [{ cwd: '/x', sessionId: 's9' }]);
    assert.strictEqual(next.sessions.s1.sessionId, 's1');
    assert.deepStrictEqual(next.sessionHistory, [{ cwd: '/x', sessionId: 's9' }]);
  });
});

describe('reconcileConnectionLost', () => {
  const pending = (): {
    snapshot: BackendHarnessSnapshot;
    elicitation: unknown[];
    permission: unknown[];
  } => {
    const permission: unknown[] = [];
    const elicitation: unknown[] = [];
    const withPendings = activeSession('s1', {
      pendingElicitation: {
        id: 'e1',
        request: {} as never,
        resolve: response => {
          elicitation.push(response);
        },
        sessionId: 's1',
      },
      pendingPermission: {
        request: {} as never,
        resolve: response => {
          permission.push(response);
        },
        sessionId: 's1',
      },
    });
    return {
      elicitation,
      permission,
      snapshot: {
        ...readySnapshot({ s1: withPendings, s2: initialSessionSnapshot('s2', 'activating') }),
        sessionHistory: [{ cwd: '/a', sessionId: 's1' }],
      },
    };
  };

  it('marks every session inactive, drops pendings, keeps transcripts, marks history unavailable', () => {
    const { snapshot } = pending();
    const reconciled = reconcileConnectionLost(snapshot);
    assert.deepStrictEqual(
      Object.values(reconciled.sessions).map(session => [session.sessionId, session.status]),
      [
        ['s1', 'inactive'],
        ['s2', 'inactive'],
      ],
    );
    assert.isUndefined(reconciled.sessions.s1.pendingPermission);
    assert.isUndefined(reconciled.sessions.s1.pendingElicitation);
    assert.deepStrictEqual(reconciled.sessions.s1.transcript, snapshot.sessions.s1.transcript);
    assert.deepStrictEqual(reconciled.sessionHistory, [{ cwd: '/a', sessionId: 's1', unavailable: true }]);
    assert.strictEqual(reconciled.phase, 'connecting');
    assert.isUndefined(reconciled.antigravityAuthUrl);
    assert.isUndefined(reconciled.failure);
  });

  it('clears a stale error and is idempotent', () => {
    const snapshot: BackendHarnessSnapshot = {
      ...readySnapshot({ s1: activeSession('s1') }),
      antigravityAuthUrl: 'https://auth.example',
      failure: { _tag: 'Failed', message: 'boom' },
      phase: 'error',
    };
    const once = reconcileConnectionLost(snapshot);
    assert.strictEqual(once.phase, 'connecting');
    assert.isUndefined(once.failure);
    assert.isUndefined(once.antigravityAuthUrl);
    assert.strictEqual(once.sessions.s1.status, 'inactive');
    assert.deepStrictEqual(reconcileConnectionLost(once), once);
  });
});

describe('applyInitializeResult', () => {
  const initializeResult = {
    _meta: { steering: { supported: true } },
    agentCapabilities: { sessionCapabilities: { close: {}, fork: {} } },
  };

  it('stores the raw result and the Agent capabilities read from it, and leaves sessions and history alone', () => {
    const before: BackendHarnessSnapshot = {
      ...readySnapshot({ s1: activeSession('s1') }),
      phase: 'connecting',
      sessionHistory: [{ cwd: '/a', sessionId: 's1' }],
    };
    const after = applyInitializeResult(before, 'claude-agent-acp', initializeResult);
    assert.strictEqual(after.initializeResult, initializeResult);
    assert.deepStrictEqual(after.agentCapabilities, {
      ...NO_AGENT_CAPABILITIES,
      sessionClose: true,
      sessionFork: true,
      steeringSupported: true,
    });
    assert.deepStrictEqual(after.agentCapabilities, agentCapabilitiesFrom('claude-agent-acp', initializeResult));
    assert.strictEqual(after.phase, 'initialized');
    assert.strictEqual(after.sessions, before.sessions);
    assert.strictEqual(after.sessionHistory, before.sessionHistory);
  });

  it('Connection lost resets the Agent capabilities', () => {
    const initialized = applyInitializeResult(readySnapshot(), 'claude-agent-acp', initializeResult);
    assert.deepStrictEqual(reconcileConnectionLost(initialized).agentCapabilities, NO_AGENT_CAPABILITIES);
    assert.deepStrictEqual(initialBackendHarnessSnapshot().agentCapabilities, NO_AGENT_CAPABILITIES);
  });
});

const pendingPermission = (sessionId: string) => ({
  request: {} as never,
  resolve: () => undefined,
  sessionId,
});
const pendingElicitation = (id: string, sessionId: string) => ({
  id,
  request: {} as never,
  resolve: () => undefined,
  sessionId,
});

describe('bootstrap and wire folds', () => {
  it('applyBootstrapPhase carries the failure and drops the Sign in URL once past signing in', () => {
    const withUrl = setAntigravityAuthUrl(readySnapshot(), 'https://auth');
    assert.strictEqual(withUrl.antigravityAuthUrl, 'https://auth');
    for (const phase of ['usable', 'ready', 'error', 'connecting'] as const) {
      assert.strictEqual(applyBootstrapPhase(withUrl, phase, undefined).antigravityAuthUrl, undefined, phase);
    }
    for (const phase of ['initialized', 'signing-in'] as const) {
      assert.strictEqual(applyBootstrapPhase(withUrl, phase, undefined).antigravityAuthUrl, 'https://auth', phase);
    }
    const failure = { message: 'boom' } as never;
    const failed = applyBootstrapPhase(readySnapshot(), 'error', failure);
    assert.strictEqual(failed.phase, 'error');
    assert.strictEqual(failed.failure, failure);
  });
});

describe('activation folds', () => {
  const defects = [{ code: 7 }];

  it('beginActivation stamps cwd, clears defects and usage, and creates a missing Session', () => {
    const snapshot = readySnapshot({
      s1: { ...initialSessionSnapshot('s1'), defects: ['x'], usage: { used: 1 } as never },
    });
    const begun = beginActivation(snapshot, 's1', '/proj', 'resume');
    assert.deepStrictEqual(
      [begun.sessions.s1.cwd, begun.sessions.s1.defects, begun.sessions.s1.status, begun.sessions.s1.usage],
      ['/proj', undefined, 'activating', undefined],
    );
    assert.strictEqual(beginActivation(readySnapshot(), 'new', '/p', 'load').sessions.new.status, 'activating');
  });

  it('beginActivation load starts from an empty transcript; resume keeps it; failActivation restores it', () => {
    const transcript = appendUserChatMessage(initialSessionSnapshot('s1').transcript, 'hello');
    const snapshot = readySnapshot({ s1: { ...initialSessionSnapshot('s1'), transcript } });
    assert.strictEqual(beginActivation(snapshot, 's1', '/proj', 'resume').sessions.s1.transcript, transcript);
    const loading = beginActivation(snapshot, 's1', '/proj', 'load');
    assert.strictEqual(loading.sessions.s1.transcript.items.length, 0);
    assert.strictEqual(failActivation(loading, 's1', defects, transcript).sessions.s1.transcript, transcript);
  });

  it('failActivation keeps the replayed transcript once replay completed; beginActivation load and resume clear the flag', () => {
    const previous = appendUserChatMessage(initialSessionSnapshot('s1').transcript, 'old');
    const replayed = appendUserChatMessage(initialSessionSnapshot('s1').transcript, 'replayed');
    const snapshot = readySnapshot({
      s1: { ...initialSessionSnapshot('s1', 'activating'), replayComplete: true, transcript: replayed },
    });
    const failed = failActivation(snapshot, 's1', defects, previous);
    assert.strictEqual(failed.sessions.s1.transcript, replayed);
    assert.strictEqual(failed.sessions.s1.status, 'inactive');
    assert.strictEqual(beginActivation(failed, 's1', '/proj', 'load').sessions.s1.replayComplete, undefined);
    assert.strictEqual(beginActivation(failed, 's1', '/proj', 'resume').sessions.s1.replayComplete, undefined);
  });

  it('failActivation records defects and goes inactive; failUnarchive records defects only', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const failed = failActivation(snapshot, 's1', defects, snapshot.sessions.s1.transcript);
    assert.deepStrictEqual([failed.sessions.s1.defects, failed.sessions.s1.status], [defects, 'inactive']);
    const unarchive = failUnarchive(snapshot, 's1', defects);
    assert.deepStrictEqual([unarchive.sessions.s1.defects, unarchive.sessions.s1.status], [defects, 'active']);
  });

  it('markActivationCwdMissing leaves the Session inactive with a defect', () => {
    const next = markActivationCwdMissing(readySnapshot(), 's1');
    assert.strictEqual(next.sessions.s1.status, 'inactive');
    assert.deepStrictEqual(next.sessions.s1.defects, [{ message: 'Session cwd missing from snapshot and history' }]);
  });

  it('applyLoadedConfiguration then finishActivation: active, with the latest configuration and carried fields', () => {
    const loaded = modelOption('gpt');
    const activating = beginActivation(readySnapshot(), 's1', '/proj', 'resume');
    const finished = finishActivation(applyLoadedConfiguration(activating, 's1', loaded), 's1');
    assert.strictEqual(finished.sessions.s1.status, 'active');
    assert.strictEqual(finished.sessions.s1.configuration, loaded);
    assert.strictEqual(finished.sessions.s1.cwd, '/proj');
  });
});

describe('created sessions', () => {
  const created = { cwd: '/proj', result: { configOptions: [], sessionId: 'new' } };

  it('addCreatedSession adds the active Session and its History row', () => {
    const next = addCreatedSession(readySnapshot(), created);
    assert.strictEqual(next.sessions.new.status, 'active');
    assert.strictEqual(next.sessions.new.cwd, '/proj');
    assert.deepStrictEqual(
      next.sessionHistory.map(entry => entry.sessionId),
      ['new'],
    );
  });

  it('bindSession adds the Session only, not a History row', () => {
    const next = bindSession(readySnapshot(), created);
    assert.strictEqual(next.sessions.new.status, 'active');
    assert.deepStrictEqual(next.sessionHistory, []);
  });

  it('dropSessionIfPresent is a no-op (same reference) when neither the Session nor its row exists', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    assert.strictEqual(dropSessionIfPresent(snapshot, 'gone'), snapshot);
    assert.deepStrictEqual(dropSessionIfPresent(snapshot, 's1').sessions, {});
  });
});

describe('prompt turn and interaction folds', () => {
  it('appendSteeredMessage adds a steering message without timing or a Pending client request', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1', { pendingClientRequest: 'prompt' }) });
    const next = appendSteeredMessage(snapshot, 's1', 'go left', []);
    const last = next.sessions.s1.transcript.items.at(-1);
    assert.strictEqual(last?.kind, 'user_message');
    assert.strictEqual(next.sessions.s1.pendingClientRequest, 'prompt');
    assert.strictEqual(appendSteeredMessage(snapshot, 'gone', 'x', []), snapshot);
  });

  it('requestPromptCancel clears only the interactions it cancelled; the next waiting one is shown', () => {
    const cancelled = pendingElicitation('e1', 's1');
    const newer = pendingElicitation('e2', 's1');
    const permission = pendingPermission('s1');
    const snapshot = readySnapshot({
      s1: activeSession('s1', {
        pendingClientRequest: 'prompt',
        pendingElicitation: cancelled,
        pendingPermission: permission,
        waitingElicitations: [newer],
      }),
    });
    const next = requestPromptCancel(snapshot, 's1', { elicitations: [cancelled], permissions: [permission] });
    assert.strictEqual(next.sessions.s1.pendingElicitation, newer);
    assert.strictEqual(next.sessions.s1.waitingElicitations, undefined);
    assert.strictEqual(next.sessions.s1.pendingPermission, undefined);
    assert.strictEqual(next.sessions.s1.promptCancelRequested, true);
    assert.strictEqual(requestPromptCancel(snapshot, 'gone', { elicitations: [], permissions: [] }), snapshot);
  });

  it('raiseElicitation / raisePermission show the first request and queue later ones behind it', () => {
    const first = pendingElicitation('e1', 's1');
    const snapshot = readySnapshot({ s1: activeSession('s1', { pendingElicitation: first }) });
    const newer = pendingElicitation('e2', 's1');
    const raised = raiseElicitation(snapshot, newer).sessions.s1;
    assert.strictEqual(raised.pendingElicitation, first);
    assert.deepStrictEqual(raised.waitingElicitations, [newer]);
    const permission = pendingPermission('s1');
    const second = pendingPermission('s1');
    const withPermissions = raisePermission(raisePermission(snapshot, permission), second).sessions.s1;
    assert.strictEqual(withPermissions.pendingPermission, permission);
    assert.deepStrictEqual(withPermissions.waitingPermissions, [second]);
  });

  it('answering the shown request shows the next waiting one, oldest first', () => {
    const [first, second, third] = [pendingPermission('s1'), pendingPermission('s1'), pendingPermission('s1')];
    const snapshot = [first, second, third].reduce(
      (next, pending) => raisePermission(next, pending),
      readySnapshot({ s1: activeSession('s1') }),
    );
    const afterFirst = answerPermission(snapshot, 's1', first).sessions.s1;
    assert.strictEqual(afterFirst.pendingPermission, second);
    assert.deepStrictEqual(afterFirst.waitingPermissions, [third]);
    const afterAll = answerPermission(answerPermission(snapshot, 's1', first), 's1', second);
    assert.strictEqual(afterAll.sessions.s1.pendingPermission, third);
    assert.strictEqual(afterAll.sessions.s1.waitingPermissions, undefined);
  });

  it("projectChildOnto copies the child root entry's shown and waiting requests onto its mirror", () => {
    const child = activeSession('child');
    const root = [pendingPermission('child'), pendingPermission('child')].reduce(
      (next, pending) => raisePermission(next, pending),
      readySnapshot({ child }),
    ).sessions.child;
    const parent = {
      ...readySnapshot(),
      subagents: { child: initialSpawnedSubagentSnapshot('child', 'p1', 'claude-agent-acp') },
    };
    const projected = projectChildOnto(parent, 'child', root);
    assert.strictEqual(projected.subagents.child?.pendingPermission, root.pendingPermission);
    assert.strictEqual(projected.subagents.child?.waitingPermissions, root.waitingPermissions);
    assert.strictEqual(projectChildOnto(projected, 'child', root), projected);
  });

  it('a same-target spawned child raises and answers its requests on its root entry, not its mirror', () => {
    const permission = pendingPermission('child');
    const elicitation = pendingElicitation('e1', 'child');
    const snapshot = {
      ...readySnapshot({ child: activeSession('child') }),
      subagents: { child: initialSpawnedSubagentSnapshot('child', 'p1', 'claude-agent-acp') },
    };
    const raised = raiseElicitation(raisePermission(snapshot, permission), elicitation);
    assert.strictEqual(raised.sessions.child.pendingPermission, permission);
    assert.strictEqual(raised.sessions.child.pendingElicitation, elicitation);
    assert.strictEqual(raised.subagents.child?.pendingPermission, undefined);
    const projected = projectChildOnto(raised, 'child', raised.sessions.child);
    assert.strictEqual(projected.subagents.child?.pendingPermission, permission);
    const answered = answerElicitation(
      answerPermission(projected, 'child', permission),
      'child',
      elicitation,
      undefined,
    );
    assert.strictEqual(answered.sessions.child.pendingPermission, undefined);
    assert.strictEqual(answered.sessions.child.pendingElicitation, undefined);
  });

  it('markSessionInactive drops the shown and the waiting requests', () => {
    const snapshot = [pendingPermission('s1'), pendingPermission('s1')].reduce(
      (next, pending) => raisePermission(next, pending),
      readySnapshot({ s1: activeSession('s1') }),
    );
    const inactive = markSessionInactive(snapshot, 's1').sessions.s1;
    assert.strictEqual(inactive.pendingPermission, undefined);
    assert.strictEqual(inactive.waitingPermissions, undefined);
  });

  it('an ExitPlanMode-shaped permission (no clear-context option) raised with no Prompt turn is answerable', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const permission = {
      ...pendingPermission('s1'),
      request: {
        options: [
          { kind: 'allow_once', name: 'Yes, and keep planning', optionId: 'default' },
          { kind: 'reject_once', name: 'No, keep planning', optionId: 'plan' },
        ],
        sessionId: 's1',
        toolCall: { kind: 'switch_mode', title: 'Ready to code?', toolCallId: 't1' },
      } as never,
    };
    const raised = raisePermission(snapshot, permission);
    assert.strictEqual(raised.sessions.s1.pendingPermission, permission);
    assert.strictEqual(answerPermission(raised, 's1', permission).sessions.s1.pendingPermission, undefined);
  });

  it('a permission or elicitation raised with no Prompt turn is shown and answerable', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    assert.isUndefined(snapshot.sessions.s1.pendingClientRequest);
    const permission = pendingPermission('s1');
    const raised = raisePermission(snapshot, permission);
    assert.strictEqual(raised.sessions.s1.pendingPermission, permission);
    assert.strictEqual(answerPermission(raised, 's1', permission).sessions.s1.pendingPermission, undefined);
    const elicitation = pendingElicitation('e1', 's1');
    const asked = raiseElicitation(snapshot, elicitation);
    assert.strictEqual(asked.sessions.s1.pendingElicitation, elicitation);
    assert.strictEqual(
      answerElicitation(asked, 's1', elicitation, undefined).sessions.s1.pendingElicitation,
      undefined,
    );
  });

  it('answerElicitation / answerPermission clear only the answered request', () => {
    const answered = pendingElicitation('e1', 's1');
    const newer = pendingElicitation('e2', 's1');
    const permission = pendingPermission('s1');
    const snapshot = readySnapshot({
      s1: activeSession('s1', { pendingElicitation: newer, pendingPermission: permission }),
    });
    assert.strictEqual(answerElicitation(snapshot, 's1', answered, undefined).sessions.s1.pendingElicitation, newer);
    assert.strictEqual(answerElicitation(snapshot, 's1', newer, undefined).sessions.s1.pendingElicitation, undefined);
    assert.strictEqual(answerPermission(snapshot, 's1', pendingPermission('s1')), snapshot);
    assert.strictEqual(answerPermission(snapshot, 's1', permission).sessions.s1.pendingPermission, undefined);
    assert.strictEqual(answerElicitation(snapshot, 'gone', answered, undefined), snapshot);
  });
});

describe('interaction folds on Subagent holders and accepted summaries', () => {
  const withSubagent = (): BackendHarnessSnapshot => ({
    ...readySnapshot(),
    subagents: {
      c1: {
        kind: 'native',
        parentSessionId: 'p1',
        sessionId: 'c1',
        transcript: initialSessionSnapshot('c1').transcript,
      },
    },
  });

  it('answerElicitation appends the accepted-form summary to the transcript', () => {
    const pending = pendingElicitation('e1', 's1');
    const snapshot = readySnapshot({ s1: activeSession('s1', { pendingElicitation: pending }) });
    const summary = { message: 'Pick', rows: [{ caption: undefined, label: 'Name', note: undefined, value: 'x' }] };
    const next = answerElicitation(snapshot, 's1', pending, summary);
    assert.strictEqual(next.sessions.s1.pendingElicitation, undefined);
    assert.strictEqual(next.sessions.s1.transcript.items.at(-1)?.kind, 'elicitation_summary');
    const empty = answerElicitation(snapshot, 's1', pending, { message: 'Pick', rows: [] });
    assert.strictEqual(empty.sessions.s1.transcript, snapshot.sessions.s1.transcript);
  });

  it('raise and answer reach a Subagent holder', () => {
    const permission = pendingPermission('c1');
    const raised = raisePermission(withSubagent(), permission);
    assert.strictEqual(raised.subagents.c1.pendingPermission, permission);
    assert.strictEqual(answerPermission(raised, 'c1', permission).subagents.c1.pendingPermission, undefined);
    const elicitation = pendingElicitation('e1', 'c1');
    const asked = raiseElicitation(withSubagent(), elicitation);
    assert.strictEqual(asked.subagents.c1.pendingElicitation, elicitation);
    assert.strictEqual(
      answerElicitation(asked, 'c1', elicitation, undefined).subagents.c1.pendingElicitation,
      undefined,
    );
  });
});

describe('restoreSubagentFromResult', () => {
  const result = {
    body: 'final',
    config: {},
    description: 'd',
    id: 'c1',
    launchTarget: 'codex-acp',
    status: 'completed',
    task: 't',
  } as const;

  it('keeps one row and the child state when replayed twice after a transcript reset', () => {
    const snapshot = readySnapshot({ s1: initialSessionSnapshot('s1') });
    const first = restoreSubagentFromResult(snapshot, 's1', result);
    const reloaded = beginActivation(first, 's1', '/proj', 'load');
    assert.strictEqual(reloaded.sessions.s1.transcript.items.length, 0);
    const again = restoreSubagentFromResult(reloaded, 's1', result);
    const rows = again.sessions.s1.transcript.items.filter(item => item.kind === 'subagent');
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(again.subagents.c1.state, { state: 'completed' });
    const thrice = restoreSubagentFromResult(again, 's1', { ...result, status: 'running' });
    assert.strictEqual(thrice.sessions.s1.transcript.items.filter(item => item.kind === 'subagent').length, 1);
    assert.deepStrictEqual(thrice.subagents.c1.state, { state: 'completed' });
  });
});
