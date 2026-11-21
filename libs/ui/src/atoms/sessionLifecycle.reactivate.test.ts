/** Reactivating active sessions when Experimental: App Orchestrated Agents changes: `session/load` re-reads the hub state. */
import { assert, describe, it } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { reconcileConnectionLost } from '../host/harnessStateTransitions.ts';
import { setHubAvailability } from '../host/hubConnection.ts';
import { createSession } from '../host/sessionRpc.ts';
import { isChildIn, reserveSlot, subagentLinksAtom } from './subagentLinkRegistry.ts';
import { appendUserChatMessage } from '../host/sessionUpdateReducer.ts';

import { backendDesiredStateAtom, backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import {
  advertise,
  CLAUDE,
  CODEX,
  freshRegistry,
  gated,
  installFakeAgent,
  installFakeHub,
} from './fakeAgent.testing.ts';
import type { McpReceived } from './fakeAgent.testing.ts';
import { BackendRestartFailed } from './harness.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.testing.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import {
  ensureVirtual,
  resetVirtualOnProviderStopped,
  setVirtualLaunchTarget,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';

const HUB_TOOLS_META = 'mcp__hoa-hub__submit_handoff';

const hubServerNames = (received: McpReceived) => (received.servers as readonly { name: string }[]).map(s => s.name);
const allowedTools = (received: McpReceived): readonly string[] | undefined =>
  (received.meta as { claudeCode?: { options?: { allowedTools?: readonly string[] } } } | undefined)?.claudeCode
    ?.options?.allowedTools;

const setup = Effect.fnUntraced(function* (
  options: {
    readonly duringClaudeLoad?: Effect.Effect<void>;
    readonly failClaudeClose?: boolean;
    readonly failClaudeLoad?: boolean;
    readonly failRestart?: readonly AgentLaunchTarget[];
  } = {},
) {
  const runtime = createHostRuntime(mockHostLayer);
  const calls: string[] = [];
  // Stand-in for `restartBackendAwaitingUsable`: the real Stop reconcile, then (unless failing) usable again.
  const restartBackend = (launchTarget: AgentLaunchTarget, registry: AtomRegistry.AtomRegistry) =>
    Effect.gen(function* () {
      calls.push(`stop:${launchTarget}`);
      if (isChildIn(registry.get(subagentLinksAtom), { launchTarget: CLAUDE, sessionId: 'child' })) {
        calls.push(`child-linked-at-stop:${launchTarget}`);
      }
      updateHarnessSnapshot(registry, launchTarget, reconcileConnectionLost);
      resetVirtualOnProviderStopped(registry, launchTarget);
      if (options.failRestart?.includes(launchTarget) === true) {
        return yield* new BackendRestartFailed({ launchTarget, reason: 'restart-fail' });
      }
      calls.push(`start:${launchTarget}`);
      advertise(registry, launchTarget, {});
    });
  const atoms = createSessionLifecycleAtoms(runtime, restartBackend);
  const registry = yield* freshRegistry;
  yield* installFakeHub([]);
  const claudeReceived: McpReceived[] = [];
  const codexReceived: McpReceived[] = [];
  yield* installFakeAgent(
    calls,
    {
      duringLoad: options.duringClaudeLoad,
      failClose: options.failClaudeClose,
      failLoad: options.failClaudeLoad,
      mcp: { received: claudeReceived },
    },
    CLAUDE,
  );
  yield* installFakeAgent(calls, { mcp: { received: codexReceived } }, CODEX);
  advertise(registry, CLAUDE, {});
  advertise(registry, CODEX, {});
  updateHarnessSnapshot(registry, CLAUDE, current => ({
    ...current,
    sessions: {
      c1: { ...initialSessionSnapshot('c1', 'active'), cwd: '/w' },
      child: { ...initialSessionSnapshot('child', 'active'), cwd: '/w' },
      idle: { ...initialSessionSnapshot('idle', 'inactive'), cwd: '/w' },
    },
  }));
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessions: { x1: { ...initialSessionSnapshot('x1', 'active'), cwd: '/w' } },
  }));
  const reactivate = runAtomFn(registry, atoms.reactivateActiveSessionsAtomFn, undefined);
  return { calls, claudeReceived, codexReceived, registry, reactivate };
});

describe('reactivateActiveSessionsAtomFn', () => {
  it.effect(
    'turning the setting on: reactivated sessions carry the hub server and, for Claude, the tool pre-approval',
    () =>
      Effect.gen(function* () {
        const s = yield* setup();
        setHubAvailability({ _tag: 'unavailable', reason: 'off' });
        // The setting flips on: the hub becomes available, then the reactivate runs.
        setHubAvailability({ _tag: 'available' });
        s.registry.set(selectedAtom, { _tag: 'Session', sessionId: 'c1' });
        yield* s.reactivate;

        const loads = s.claudeReceived.filter(r => r.rpc === 'load');
        assert.isAbove(loads.length, 0);
        for (const load of loads) {
          assert.deepStrictEqual(hubServerNames(load), ['hoa-hub']);
          assert.include(allowedTools(load) ?? [], HUB_TOOLS_META);
        }
        assert.deepStrictEqual(
          s.codexReceived.map(r => [r.rpc, hubServerNames(r)]),
          [['load', ['hoa-hub']]],
        );
        assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CLAUDE)).sessions.c1?.status, 'active');
        assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CLAUDE)).sessions.idle?.status, 'inactive');
        assert.deepStrictEqual(s.registry.get(selectedAtom), { _tag: 'Session', sessionId: 'c1' });
      }).pipe(Effect.scoped),
  );

  it.effect('turning the setting off: reactivated sessions carry no mcpServers and no tool pre-approval', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      setHubAvailability({ _tag: 'unavailable', reason: 'Experimental: App Orchestrated Agents is off in Settings.' });
      yield* s.reactivate;

      const loads = s.claudeReceived.filter(r => r.rpc === 'load');
      assert.isAbove(loads.length, 0);
      for (const load of loads) {
        assert.deepStrictEqual(load.servers, []);
        assert.isUndefined(allowedTools(load));
      }
      assert.deepStrictEqual(
        s.codexReceived.map(r => [r.rpc, r.servers]),
        [['load', []]],
      );
    }).pipe(Effect.scoped),
  );

  it.effect(
    'an Agent without sessionClose that refuses the close still gets session/load with the new mcpServers',
    () =>
      Effect.gen(function* () {
        const s = yield* setup({ failClaudeClose: true });
        // `advertise(..., {})` leaves sessionClose unadvertised: the close is best-effort and its failure is swallowed.
        assert.isFalse(s.registry.get(backendHarnessSnapshotAtom(CLAUDE)).agentCapabilities.sessionClose);
        setHubAvailability({ _tag: 'available' });
        yield* s.reactivate;

        assert.include(s.calls, 'close:c1');
        const load = s.claudeReceived.find(r => r.rpc === 'load');
        assert.deepStrictEqual(load === undefined ? [] : hubServerNames(load), ['hoa-hub']);
        assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CLAUDE)).sessions.c1?.status, 'active');
      }).pipe(Effect.scoped),
  );

  it.effect('a session/new after the change follows the new state', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      setHubAvailability({ _tag: 'unavailable', reason: 'off' });
      yield* s.reactivate;
      yield* createSession(CLAUDE, '/w');
      assert.deepStrictEqual(s.claudeReceived.findLast(r => r.rpc === 'new')?.servers, []);
      setHubAvailability({ _tag: 'available' });
      yield* createSession(CLAUDE, '/w');
      const created = s.claudeReceived.findLast(r => r.rpc === 'new');
      assert.deepStrictEqual(created === undefined ? [] : hubServerNames(created), ['hoa-hub']);
      assert.include((created === undefined ? undefined : allowedTools(created)) ?? [], HUB_TOOLS_META);
    }).pipe(Effect.scoped),
  );

  it.effect('skips Spawned subagent sessions: they end with their parent', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      reserveSlot(s.registry, { launchTarget: CODEX, sessionId: 'x1' })?.register({
        child: { launchTarget: CLAUDE, sessionId: 'child' },
        description: 'child',
        task: 'task',
      });
      yield* s.reactivate;
      assert.notInclude(s.calls, 'load:child');
      assert.include(s.calls, 'load:c1');
    }).pipe(Effect.scoped),
  );

  it.effect('one session failing to reactivate does not block the others', () =>
    Effect.gen(function* () {
      const s = yield* setup({ failClaudeLoad: true });
      yield* s.reactivate;
      assert.include(s.calls, 'load:c1');
      assert.include(s.calls, 'load:x1');
      assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.x1?.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('a second change mid-run never leaves a session inactive', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const s = yield* setup({ duringClaudeLoad: gate.during });
      setHubAvailability({ _tag: 'available' });
      const first = yield* Effect.forkChild(s.reactivate);
      yield* gate.started;
      // The second toggle re-runs the fn while the first is between Deactivate and Activate of c1.
      const second = yield* Effect.forkChild(s.reactivate);
      yield* Effect.yieldNow;
      yield* gate.release;
      yield* Fiber.join(second);
      yield* Fiber.interrupt(first);

      const claude = s.registry.get(backendHarnessSnapshotAtom(CLAUDE)).sessions;
      assert.strictEqual(claude.c1?.status, 'active');
      assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.x1?.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('waits for a connecting hub, however long, so sessions come back with the hub server', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      setHubAvailability({ _tag: 'connecting' });
      const run = yield* Effect.forkChild(s.reactivate);
      // Longer than a session RPC's own settle window (5s) would matter: nothing reactivates while connecting.
      yield* Effect.promise(
        () =>
          new Promise<void>(resolve => {
            setTimeout(resolve, 50);
          }),
      );
      assert.deepStrictEqual(s.claudeReceived, []);
      assert.deepStrictEqual(s.codexReceived, []);

      setHubAvailability({ _tag: 'available' });
      yield* Fiber.join(run);
      const loads = s.claudeReceived.filter(r => r.rpc === 'load');
      assert.isAbove(loads.length, 0);
      for (const load of loads) {
        assert.deepStrictEqual(hubServerNames(load), ['hoa-hub']);
      }
    }).pipe(Effect.scoped),
  );

  it.effect('closes, restarts the Provider, then resumes/loads with the new mcpServers', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      setHubAvailability({ _tag: 'available' });
      yield* s.reactivate;
      const at = (call: string) => s.calls.indexOf(call);
      assert.isAbove(at('stop:claude-agent-acp'), at('close:c1'));
      assert.isAbove(at('start:claude-agent-acp'), at('stop:claude-agent-acp'));
      assert.isAbove(at('load:c1'), at('start:claude-agent-acp'));
      assert.isAbove(at('stop:codex-acp'), at('close:x1'));
      assert.isAbove(at('load:x1'), at('start:codex-acp'));
      // The Claude group finishes before Codex's restart: one launch target at a time.
      assert.deepStrictEqual(
        s.codexReceived.map(r => hubServerNames(r)),
        [['hoa-hub']],
      );
      assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CLAUDE)).sessions.c1?.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('does not restart a launch target without sessions to reactivate', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      updateHarnessSnapshot(s.registry, CODEX, current => ({
        ...current,
        sessions: { x1: { ...initialSessionSnapshot('x1', 'inactive'), cwd: '/w' } },
      }));
      yield* s.reactivate;
      assert.include(s.calls, 'stop:claude-agent-acp');
      assert.notInclude(s.calls, 'stop:codex-acp');
    }).pipe(Effect.scoped),
  );

  it.effect('never restarts a Provider the user stopped', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.registry.set(backendDesiredStateAtom(CODEX), 'stopped');
      yield* s.reactivate;
      assert.notInclude(s.calls, 'stop:codex-acp');
      assert.notInclude(s.calls, 'close:x1');
    }).pipe(Effect.scoped),
  );

  it.effect('a failed restart leaves that target inactive and does not block another target', () =>
    Effect.gen(function* () {
      const s = yield* setup({ failRestart: [CLAUDE] });
      yield* s.reactivate;
      assert.notInclude(s.calls, 'load:c1');
      const { c1 } = s.registry.get(backendHarnessSnapshotAtom(CLAUDE)).sessions;
      assert.strictEqual(c1?.status, 'inactive');
      // Visible to the user: the "Activation failed" defects name the Provider restart failure.
      assert.deepStrictEqual(c1?.defects, [{ message: 'Provider restart failed: restart-fail' }]);
      assert.include(s.calls, 'load:x1');
      assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.x1?.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('a draft on a restarted launch target keeps its launch target', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* ensureVirtual(s.registry, { cwd: '/w' });
      yield* setVirtualLaunchTarget(s.registry, CLAUDE);
      yield* s.reactivate;
      const virtual = s.registry.get(virtualSessionAtom);
      assert.strictEqual(virtual?.launchTarget, CLAUDE);
    }).pipe(Effect.scoped),
  );

  it.effect('reactivates right after a restart while Session History entries are still unavailable', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      updateHarnessSnapshot(s.registry, CLAUDE, current => ({
        ...current,
        sessionHistory: [{ cwd: '/w', sessionId: 'c1', title: 'chat' }],
        sessions: {
          ...current.sessions,
          c1: {
            ...initialSessionSnapshot('c1', 'active'),
            cwd: '/w',
            transcript: appendUserChatMessage(initialSessionSnapshot('c1', 'active').transcript, 'hello'),
          },
        },
      }));
      yield* s.reactivate;
      const claude = s.registry.get(backendHarnessSnapshotAtom(CLAUDE));
      // The restart's Connection lost marked the entry unavailable; Activate still works from the local session.
      assert.isTrue(claude.sessionHistory.find(entry => entry.sessionId === 'c1')?.unavailable === true);
      assert.include(s.calls, 'load:c1');
      assert.strictEqual(claude.sessions.c1?.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('ends Spawned subagent links of every reactivated parent before any Provider restarts', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      reserveSlot(s.registry, { launchTarget: CODEX, sessionId: 'x1' })?.register({
        child: { launchTarget: CLAUDE, sessionId: 'child' },
        description: 'child',
        task: 'task',
      });
      yield* s.reactivate;
      assert.include(s.calls, 'stop:claude-agent-acp');
      assert.isFalse(s.calls.some(call => call.startsWith('child-linked-at-stop')));
    }).pipe(Effect.scoped),
  );
});
