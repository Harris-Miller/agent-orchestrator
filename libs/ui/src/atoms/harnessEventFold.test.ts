import { assert, describe, it } from '@effect/vitest';
import { pinSession, readConfigOptionIndexCache } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Notifier } from '@lib/context-services';
import type { HostServices } from '@lib/context-services';
import type { Tracer } from 'effect';
import { Effect, Layer, Option } from 'effect';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';

import fixture from '../../fixtures/claude_subagent_session_updates.json' with { type: 'json' };
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { BackendConnectionReports } from '../host/sessionRpc.ts';
import { getPromptSpan, sendPrompt } from '../host/sessionRpc.ts';

import { backendHarnessSnapshotAtom, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { configOptionIndexAtom } from './backendState.atoms.ts';
import { connectFakeAgent, enableProviders, installFakeAgent } from './fakeAgent.testing.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from './pinnedSessions.atoms.ts';
import { rpcWireLogAtom } from './rpcWireLog.ts';
import {
  editVirtual,
  ensureVirtual,
  sendVirtual,
  setVirtualConfigOption,
  setVirtualLaunchTarget,
  virtualMaterializingAtom,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';
import { userSettingsDocumentAtom } from './userSettings/userSettingsDocument.atoms.ts';

const LT = 'codex-acp' as const;
const CHILD = 'p1:replay-subagent:toolu_A';
const [spawn] = fixture;

const setup = Effect.fnUntraced(function* () {
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), r =>
    Effect.sync(() => {
      r.dispose();
    }),
  );
  const store = new Map<string, MapFsEntry>();
  const notified: { readonly body: string; readonly title: string }[] = [];
  const forked: Effect.Effect<unknown, never, HostServices>[] = [];
  const fold = makeHarnessEventFold({
    launchTarget: LT,
    registry,
    runFork: effect => {
      forked.push(effect);
    },
  });
  const layer = Layer.mergeAll(
    mockHostLayer,
    mapFsTestServices(store),
    Layer.succeed(Notifier, {
      isWindowFocused: Effect.succeed(false),
      playSound: Effect.void,
      notify: ({ body, title }) =>
        Effect.sync(() => {
          notified.push({ body, title });
        }),
      supported: 'os',
    }),
  );
  /** Run every consequence the fold forked so far, against the in-memory host. */
  const drain = Effect.suspend(() => Effect.forEach(forked.splice(0), effect => effect, { discard: true })).pipe(
    Effect.provide(layer),
  );
  const snapshot = () => registry.get(backendHarnessSnapshotAtom(LT));
  return { drain, fold, layer, notified, registry, snapshot, store };
});

/** Minimal fake agent whose `session/new` answers with `sessionId`; released (with `reports`) when the scope closes. */
const fakeSessionNew = (sessionId: string, reports?: BackendConnectionReports) =>
  connectFakeAgent(LT, { agent: { 'session/new': () => Effect.succeed({ sessionId }) } }, reports);

/** Selected Virtual on `/a` + this launch target (+ `model`), seeded through the Virtual session verbs while not usable. */
const seedVirtual = Effect.fnUntraced(function* (h: Effect.Success<ReturnType<typeof setup>>, model?: string) {
  enableProviders(h.registry, [LT]);
  yield* ensureVirtual(h.registry, { cwd: '/a' });
  yield* setVirtualLaunchTarget(h.registry, LT);
  if (model !== undefined) {
    yield* setVirtualConfigOption(h.registry, { configId: 'model', launchTarget: LT, type: 'select', value: model });
  }
});

describe('Harness event fold: session/update', () => {
  it.effect('usage_update sets the session usage in memory only', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      updateHarnessSnapshot(h.registry, LT, current => ({
        ...current,
        sessions: { s1: initialSessionSnapshot('s1', 'active') },
      }));

      h.fold.onSessionUpdate('s1', {
        cost: { amount: 0.5, currency: 'USD' },
        sessionUpdate: 'usage_update',
        size: 200,
        used: 20,
      });
      yield* h.drain;

      const usage = { cost: { amount: 0.5, currency: 'USD' }, size: 200, used: 20 };
      assert.deepStrictEqual(h.snapshot().sessions.s1.usage, usage);
      assert.strictEqual(h.store.size, 0);
    }),
  );

  it.effect('a message chunk for an unseen id seeds its transcript', () =>
    Effect.gen(function* () {
      const h = yield* setup();

      h.fold.onSessionUpdate('s1', { content: { text: 'hello', type: 'text' }, sessionUpdate: 'agent_message_chunk' });
      yield* h.drain;

      const { items } = h.snapshot().sessions.s1.transcript;
      assert.strictEqual(items.length, 1);
      assert.deepInclude(items[0], { kind: 'agent_message', text: 'hello' });
      assert.strictEqual(h.store.size, 0);
    }),
  );

  it.effect('session_info_update retitles the Session History entry', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      updateHarnessSnapshot(h.registry, LT, current => ({
        ...current,
        sessionHistory: [{ cwd: '/proj', sessionId: 's1', title: 'Old' }],
        sessions: { s1: initialSessionSnapshot('s1', 'active') },
      }));

      h.fold.onSessionUpdate('s1', { sessionUpdate: 'session_info_update', title: 'New' });
      yield* h.drain;

      assert.deepStrictEqual(h.snapshot().sessionHistory, [{ cwd: '/proj', sessionId: 's1', title: 'New' }]);
    }),
  );
});

describe('Harness event fold: subagent link', () => {
  it.effect('migrates a stray root and parents the child under the root prompt span', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      updateHarnessSnapshot(h.registry, LT, current => ({
        ...current,
        sessions: { [CHILD]: initialSessionSnapshot(CHILD, 'active'), p1: initialSessionSnapshot('p1', 'active') },
      }));
      const spans: { child?: Tracer.AnySpan; root?: Tracer.AnySpan } = {};
      yield* installFakeAgent([], {
        duringPrompt: Effect.sync(() => {
          h.fold.onSessionUpdate('p1', spawn.update);
          spans.child = getPromptSpan(LT, CHILD);
          spans.root = getPromptSpan(LT, 'p1');
        }),
      });

      yield* sendPrompt(LT, 'p1', []);
      yield* h.drain;

      assert.notProperty(h.snapshot().sessions, CHILD);
      assert.strictEqual(h.snapshot().subagents[CHILD].parentSessionId, 'p1');
      assert.isDefined(spans.root);
      assert.strictEqual(spans.child, spans.root);
      assert.isUndefined(getPromptSpan(LT, CHILD));
    }),
  );
});

describe('Harness event fold: pending interactions', () => {
  it.effect('a permission request becomes pending on the root session and raises one Attention event', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      updateHarnessSnapshot(h.registry, LT, current => ({
        ...current,
        sessionHistory: [{ cwd: '/proj', sessionId: 's1', title: 'My chat' }],
        sessions: { s1: initialSessionSnapshot('s1', 'active') },
      }));

      h.fold.onPermissionRequest('s1', {} as never, () => undefined);
      yield* h.drain;

      assert.strictEqual(h.snapshot().sessions.s1.pendingPermission?.sessionId, 's1');
      assert.deepStrictEqual(h.notified, [{ body: 'Needs permission', title: 'My chat' }]);
    }),
  );

  it.effect('an elicitation for a subagent becomes pending on the child and names it in the Attention event', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      updateHarnessSnapshot(h.registry, LT, current => ({
        ...current,
        sessionHistory: [{ cwd: '/proj', sessionId: 'p1', title: 'My chat' }],
        sessions: { p1: initialSessionSnapshot('p1', 'active') },
      }));
      h.fold.onSessionUpdate('p1', spawn.update);

      h.fold.onElicitationCreate(CHILD, {}, () => undefined);
      yield* h.drain;

      assert.strictEqual(h.snapshot().subagents[CHILD].pendingElicitation?.sessionId, CHILD);
      assert.notProperty(h.snapshot().sessions, CHILD);
      assert.deepStrictEqual(h.notified, [{ body: 'Needs input', title: 'My chat · Reply alpha' }]);
    }),
  );

  it.effect('the Attention event honors the in-memory User settings', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      h.registry.set(userSettingsDocumentAtom, AsyncResult.success({ notificationsEnabled: false }));
      updateHarnessSnapshot(h.registry, LT, current => ({
        ...current,
        sessions: { s1: initialSessionSnapshot('s1', 'active') },
      }));

      h.fold.onPermissionRequest('s1', {} as never, () => undefined);
      yield* h.drain;

      assert.strictEqual(h.snapshot().sessions.s1.pendingPermission?.sessionId, 's1');
      assert.deepStrictEqual(h.notified, []);
    }),
  );
});

describe('Harness event fold: bootstrap reports', () => {
  it.effect('usable and error clear the Sign in URL; error records the failure', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      h.fold.onPhase('signing-in');
      h.fold.onAntigravityAuthUrl?.('https://auth.example');
      assert.strictEqual(h.snapshot().antigravityAuthUrl, 'https://auth.example');

      h.fold.onPhase('usable');
      assert.strictEqual(h.snapshot().phase, 'usable');
      assert.isUndefined(h.snapshot().antigravityAuthUrl);

      h.fold.onAntigravityAuthUrl?.('https://auth.example');
      h.fold.onPhase('error', { _tag: 'NotSignedIn', message: 'Sign in' });
      assert.strictEqual(h.snapshot().phase, 'error');
      assert.deepStrictEqual(h.snapshot().failure, { _tag: 'NotSignedIn', message: 'Sign in' });
      assert.isUndefined(h.snapshot().antigravityAuthUrl);
      yield* h.drain;
    }),
  );

  it.effect('usable with the Virtual blob on this launch target Binds it', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      yield* fakeSessionNew('bound');
      yield* seedVirtual(h);
      assert.isUndefined(h.registry.get(virtualSessionAtom)?.sessionId);

      h.fold.onPhase('usable');
      yield* h.drain;

      assert.strictEqual(h.registry.get(virtualSessionAtom)?.sessionId, 'bound');
      assert.strictEqual(h.snapshot().sessions.bound.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('initialize result and wire messages land on the snapshot', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      h.fold.onInitializeResult({ _meta: { steering: { supported: true } }, protocolVersion: 1 });
      h.fold.onRpcMessage('out', { method: 'initialize' });
      h.fold.onRpcMessage('in', { result: {} });

      assert.strictEqual(h.snapshot().phase, 'initialized');
      assert.deepStrictEqual(h.snapshot().initializeResult, {
        _meta: { steering: { supported: true } },
        protocolVersion: 1,
      });
      assert.isTrue(h.snapshot().agentCapabilities.steeringSupported);
      assert.deepStrictEqual(
        h.registry.get(rpcWireLogAtom(LT)).map(({ direction, message }) => ({ direction, message })),
        [
          { direction: 'out', message: { method: 'initialize' } },
          { direction: 'in', message: { result: {} } },
        ],
      );
      yield* h.drain;
    }),
  );
});

describe('Harness event fold: Connection lost', () => {
  it.effect('sessions inactive, pendings cancelled, history unavailable, wire log kept', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const permission: unknown[] = [];
      const elicitation: unknown[] = [];
      updateHarnessSnapshot(h.registry, LT, current => ({
        ...current,
        phase: 'ready',
        sessionHistory: [{ cwd: '/proj', sessionId: 's1', title: 'My chat' }],
        sessions: { s1: initialSessionSnapshot('s1', 'active') },
      }));
      h.fold.onRpcMessage('out', { method: 'session/prompt' });
      h.fold.onPermissionRequest('s1', {} as never, response => {
        permission.push(response);
      });
      h.fold.onElicitationCreate('s1', {}, response => {
        elicitation.push(response);
      });

      h.fold.onConnectionLost();
      yield* h.drain;

      const { phase, sessionHistory, sessions } = h.snapshot();
      assert.strictEqual(sessions.s1.status, 'inactive');
      assert.isUndefined(sessions.s1.pendingPermission);
      assert.isUndefined(sessions.s1.pendingElicitation);
      assert.deepStrictEqual(permission, [{ outcome: { outcome: 'cancelled' } }]);
      assert.deepStrictEqual(elicitation, [{ action: 'cancel' }]);
      assert.deepStrictEqual(sessionHistory, [{ cwd: '/proj', sessionId: 's1', title: 'My chat', unavailable: true }]);
      assert.deepStrictEqual(
        h.registry.get(rpcWireLogAtom(LT)).map(({ message }) => message),
        [{ method: 'session/prompt' }],
      );
      assert.strictEqual(phase, 'connecting');
    }),
  );

  it.effect('unbinds the Virtual session but keeps draft, launch target and Config', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      yield* seedVirtual(h, 'gpt');
      h.fold.onPhase('usable');
      yield* h.drain;
      const bound = h.registry.get(virtualSessionAtom);
      assert.strictEqual(bound?.sessionId, 'bound-1');

      h.fold.onConnectionLost();
      yield* h.drain;

      const after = h.registry.get(virtualSessionAtom);
      assert.isUndefined(after?.sessionId);
      assert.strictEqual(after?.launchTarget, LT);
      assert.strictEqual(after?.cwd, '/a');
      assert.strictEqual(after?.draft, bound?.draft);
      assert.deepStrictEqual(after?.configValues, bound?.configValues);
      assert.notProperty(h.snapshot().sessions, 'bound-1');
      assert.deepStrictEqual(calls, ['new']);
    }),
  );

  it.effect('leaves a Virtual session Bound on another launch target alone', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const other = makeHarnessEventFold({
        launchTarget: 'claude-agent-acp',
        registry: h.registry,
        runFork: () => undefined,
      });
      yield* fakeSessionNew('bound');
      yield* seedVirtual(h);
      h.fold.onPhase('usable');
      yield* h.drain;
      const bound = h.registry.get(virtualSessionAtom);
      assert.strictEqual(bound?.sessionId, 'bound');

      other.onConnectionLost();

      assert.strictEqual(h.registry.get(virtualSessionAtom), bound);
      assert.strictEqual(h.snapshot().sessions.bound.status, 'active');
    }),
  );

  it.effect('leaves the Bound Virtual session alone under the Lifecycle lock (Materialize owns it)', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const calls: string[] = [];
      const during: { inSnapshot?: boolean; locked?: boolean; sessionId?: string } = {};
      yield* installFakeAgent(calls, {
        duringSetConfig: Effect.sync(() => {
          h.fold.onConnectionLost();
          during.locked = h.registry.get(virtualMaterializingAtom);
          during.sessionId = h.registry.get(virtualSessionAtom)?.sessionId;
          during.inSnapshot = 'bound-1' in h.snapshot().sessions;
        }),
      });
      yield* seedVirtual(h, 'o1');
      yield* editVirtual(h.registry, { draft: 'hello' });
      h.fold.onPhase('usable');
      yield* h.drain;
      assert.strictEqual(h.registry.get(virtualSessionAtom)?.sessionId, 'bound-1');

      // The session died mid-Materialize: the Send fails, the blob keeps its draft and forgets the dead id.
      const error = yield* Effect.flip(sendVirtual(h.registry, () => Effect.void));
      yield* h.drain;

      assert.strictEqual(error._tag, 'ProviderUnavailable');
      assert.deepStrictEqual(during, { inSnapshot: true, locked: true, sessionId: 'bound-1' });
      assert.deepStrictEqual(calls, ['new', 'set:model:o1']);
      assert.strictEqual(h.registry.get(virtualSessionAtom)?.draft, 'hello');
      assert.strictEqual(h.registry.get(virtualSessionAtom)?.sessionId, undefined);
    }),
  );

  it.effect('after Connection lost the next usable Binds a fresh session', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      yield* seedVirtual(h);
      yield* Effect.gen(function* () {
        yield* fakeSessionNew('old', h.fold);
        h.fold.onPhase('usable');
        yield* h.drain;
        assert.strictEqual(h.registry.get(virtualSessionAtom)?.sessionId, 'old');
      }).pipe(Effect.scoped);
      // Let the detached Bind fiber settle its bookkeeping (the harness's retry sleep does this in the app).
      yield* Effect.yieldNow;

      yield* fakeSessionNew('new', h.fold);
      h.fold.onPhase('usable');
      yield* h.drain;

      assert.strictEqual(h.registry.get(virtualSessionAtom)?.sessionId, 'new');
      assert.notProperty(h.snapshot().sessions, 'old');
    }),
  );

  it.effect('a Bind in flight at Connection lost does not bind the dead session', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const calls: string[] = [];
      yield* installFakeAgent(calls, {
        duringNew: Effect.sync(() => {
          h.fold.onConnectionLost();
        }),
      });
      yield* seedVirtual(h);
      h.fold.onPhase('usable');
      yield* h.drain;

      assert.isUndefined(h.registry.get(virtualSessionAtom)?.sessionId);
      assert.notProperty(h.snapshot().sessions, 'bound-1');
    }),
  );
});

describe('Harness event fold: Session History list', () => {
  it.effect(
    'merges the listed scope, hides the Bound Virtual id, and keeps pins made while the list was in flight',
    () =>
      Effect.gen(function* () {
        const h = yield* setup();
        updateHarnessSnapshot(h.registry, LT, current => ({
          ...current,
          sessionHistory: [
            { cwd: '/a', sessionId: 'a-gone' },
            { cwd: '/b', sessionId: 'b-kept' },
          ],
        }));
        yield* fakeSessionNew('bound');
        yield* seedVirtual(h);
        h.fold.onPhase('usable');
        yield* h.drain;
        assert.strictEqual(h.registry.get(virtualSessionAtom)?.sessionId, 'bound');
        const before = yield* pinSession(toLaunchTarget(LT), { cwd: '/a', sessionId: 'a-gone' }).pipe(
          Effect.provide(h.layer),
        );
        h.registry.set(pinnedSessionsAtom(LT), before.pinned);
        h.registry.set(pinsLoadedAtom(LT), true);

        h.fold.onSessionHistoryRequest();
        const during = yield* pinSession(toLaunchTarget(LT), { cwd: '/a', sessionId: 'a-new-pin' }).pipe(
          Effect.provide(h.layer),
        );
        h.registry.set(pinnedSessionsAtom(LT), during.pinned);
        h.fold.onSessionHistoryResult(
          {
            sessions: [
              { cwd: '/a', sessionId: 'a-listed' },
              { cwd: '/a', sessionId: 'bound' },
            ],
          },
          { _tag: 'Cwd', cwd: '/a' },
        );
        yield* h.drain;

        assert.sameMembers(
          h.snapshot().sessionHistory.map(entry => entry.sessionId),
          ['b-kept', 'a-listed'],
        );
        assert.deepStrictEqual(
          h.registry.get(pinnedSessionsAtom(LT)).map(pin => pin.sessionId),
          ['a-new-pin'],
        );
      }).pipe(Effect.scoped),
  );
});

const modelOption = (currentValue: string) => ({
  choices: [
    { id: 'gpt', name: 'GPT' },
    { id: 'o1', name: 'o1' },
  ],
  currentValue,
  id: 'model',
  name: 'Model',
  type: 'select' as const,
});

describe('Harness event fold: Config option index', () => {
  it.effect('a publish sets the index, resets unsupported Virtual values, and writes the cache', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      yield* seedVirtual(h, 'retired');
      const index: ConfigOptionIndex = {
        byModel: { gpt: [modelOption('gpt')] },
        defaultModelId: 'gpt',
        unavailableModelIds: [],
      };

      h.fold.onConfigOptionIndexPublish(index);
      yield* h.drain;

      assert.strictEqual(h.registry.get(configOptionIndexAtom(LT)), index);
      assert.isTrue(h.fold.hasConfigOptionIndex());
      assert.deepStrictEqual(h.registry.get(virtualSessionAtom)?.configValues, { model: 'gpt' });
      const cached = yield* readConfigOptionIndexCache(toLaunchTarget(LT)).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(Option.getOrUndefined(cached), index);
    }),
  );

  it.effect('Lazy hydrate merges a picked model row into the published index', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      assert.isFalse(h.fold.hasConfigOptionIndex());
      h.fold.onConfigOptionIndexPublish({
        byModel: { gpt: [modelOption('gpt')] },
        defaultModelId: 'gpt',
        unavailableModelIds: ['o1'],
      });

      h.fold.onConfigIndexEvent({
        _tag: 'ModelPicked',
        modelId: 'o1',
        response: {
          configOptions: [
            {
              currentValue: 'o1',
              id: 'model',
              name: 'Model',
              options: [
                { name: 'GPT', value: 'gpt' },
                { name: 'o1', value: 'o1' },
              ],
              type: 'select',
            },
          ],
        },
      });
      yield* h.drain;

      const merged = h.registry.get(configOptionIndexAtom(LT));
      assert.deepStrictEqual(Object.keys(merged?.byModel ?? {}).sort(), ['gpt', 'o1']);
      assert.deepStrictEqual(merged?.unavailableModelIds, []);
      const cached = yield* readConfigOptionIndexCache(toLaunchTarget(LT)).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(Object.keys(Option.getOrUndefined(cached)?.byModel ?? {}).sort(), ['gpt', 'o1']);
    }),
  );

  it.effect('newly advertised models are written to the top of Model order', () =>
    Effect.gen(function* () {
      const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), r =>
        Effect.sync(() => {
          r.dispose();
        }),
      );
      const written: unknown[] = [];
      const fold = makeHarnessEventFold({
        launchTarget: LT,
        registry,
        runFork: () => undefined,
        setModelPickerPrefs: prefs => {
          written.push(prefs);
        },
      });
      const select = (ids: readonly string[]) => ({
        configOptions: [
          {
            currentValue: 'gpt',
            id: 'model',
            name: 'Model',
            options: ids.map(id => ({ name: id, value: id })),
            type: 'select',
          },
        ],
      });
      fold.onConfigIndexEvent({ _tag: 'SessionNew', response: select(['gpt']) });
      assert.deepStrictEqual(written, []);
      fold.onConfigIndexEvent({ _tag: 'ModelPicked', modelId: 'gpt', response: select(['gpt', 'fresh']) });
      assert.deepStrictEqual(written, [{ hidden: [], order: ['fresh'] }]);
    }),
  );
});
