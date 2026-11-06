import { assert, describe, it } from '@effect/vitest';
import { pinSession, readConfigOptionIndexCache, readSessionUsage, writeSessionUsage } from '@lib/ao-home';
import { mapFsTestServices } from '@lib/ao-home/testing';
import type { MapFsEntry } from '@lib/ao-home/testing';
import { Notifier } from '@lib/context-services';
import type { HostServices } from '@lib/context-services';
import { Effect, Layer, Option, Tracer } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import fixture from '../../fixtures/claude_subagent_session_updates.json' with { type: 'json' };
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import { clearPromptSpansForLaunchTarget, getPromptSpan, setPromptSpan } from '../host/promptSpanRegistry.ts';
import { clearConnectedAgent, setConnectedAgent } from '../host/sessionRpc.ts';

import { backendHarnessSnapshotAtom, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { configOptionIndexAtom, providerEnabledMapAtom } from './backendState.atoms.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from './pinnedSessions.atoms.ts';
import {
  ensureVirtual,
  setVirtualConfigOption,
  setVirtualLaunchTarget,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

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
    refreshFsListing: () => Effect.void,
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

/** Minimal fake agent whose `session/new` answers with `sessionId`; cleared when the scope closes. */
const fakeSessionNew = (sessionId: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      setConnectedAgent(LT, {
        agent: { 'session/new': () => Effect.succeed({ sessionId }) },
      } as unknown as Parameters<typeof setConnectedAgent>[1]);
    }),
    () =>
      Effect.sync(() => {
        clearConnectedAgent(LT);
      }),
  );

/** Selected Virtual on `/a` + this launch target (+ `model`), seeded through the Virtual session verbs while not usable. */
const seedVirtual = (h: Effect.Success<ReturnType<typeof setup>>, model?: string) =>
  Effect.gen(function* () {
    h.registry.set(providerEnabledMapAtom, { [LT]: true });
    yield* ensureVirtual(h.registry, { cwd: '/a' });
    yield* setVirtualLaunchTarget(h.registry, LT);
    if (model !== undefined) {
      yield* setVirtualConfigOption(h.registry, { configId: 'model', launchTarget: LT, type: 'select', value: model });
    }
  });

describe('Harness event fold: session/update', () => {
  it.effect('usage_update sets the session usage and persists it', () =>
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
      const persisted = yield* readSessionUsage('s1').pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(Option.getOrUndefined(persisted), usage);
    }),
  );

  it.effect('a message chunk for an unseen id seeds its transcript and persists no usage', () =>
    Effect.gen(function* () {
      const h = yield* setup();

      h.fold.onSessionUpdate('s1', { content: { text: 'hello', type: 'text' }, sessionUpdate: 'agent_message_chunk' });
      yield* h.drain;

      const { items } = h.snapshot().sessions.s1.transcript;
      assert.strictEqual(items.length, 1);
      assert.deepInclude(items[0], { kind: 'agent_message', text: 'hello' });
      assert.isTrue(Option.isNone(yield* readSessionUsage('s1').pipe(Effect.provide(h.layer))));
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
  it.effect('migrates a stray root, deletes its session dir, and parents the child under the root prompt span', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      updateHarnessSnapshot(h.registry, LT, current => ({
        ...current,
        sessions: { [CHILD]: initialSessionSnapshot(CHILD, 'active'), p1: initialSessionSnapshot('p1', 'active') },
      }));
      yield* writeSessionUsage(CHILD, { size: 1, used: 1 }).pipe(Effect.provide(h.layer));
      const rootSpan = Tracer.externalSpan({ spanId: 'root-span', traceId: 'trace' });
      setPromptSpan(LT, 'p1', rootSpan);

      h.fold.onSessionUpdate('p1', spawn.update);
      yield* h.drain;

      assert.notProperty(h.snapshot().sessions, CHILD);
      assert.strictEqual(h.snapshot().subagents[CHILD].parentSessionId, 'p1');
      assert.isTrue(Option.isNone(yield* readSessionUsage(CHILD).pipe(Effect.provide(h.layer))));
      assert.strictEqual(getPromptSpan(LT, CHILD), rootSpan);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          clearPromptSpansForLaunchTarget(LT);
        }),
      ),
    ),
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
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          clearPromptSpansForLaunchTarget(LT);
        }),
      ),
    ),
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
      h.fold.onInitializeResult({ protocolVersion: 1 });
      h.fold.onRpcMessage('out', { method: 'initialize' });
      h.fold.onRpcMessage('in', { result: {} });

      assert.strictEqual(h.snapshot().phase, 'initialized');
      assert.deepStrictEqual(h.snapshot().initializeResult, { protocolVersion: 1 });
      assert.deepStrictEqual(
        h.snapshot().rpcCalls.map(({ direction, message }) => ({ direction, message })),
        [
          { direction: 'out', message: { method: 'initialize' } },
          { direction: 'in', message: { result: {} } },
        ],
      );
      yield* h.drain;
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
});
