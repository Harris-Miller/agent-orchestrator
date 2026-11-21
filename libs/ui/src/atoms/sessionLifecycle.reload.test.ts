/** Reloading active sessions when Experimental: App Orchestrated Agents changes: `session/load` re-reads the hub state. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { setHubAvailability } from '../host/hubConnection.ts';
import { createSession } from '../host/sessionRpc.ts';
import { reserveSlot } from './subagentLinkRegistry.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { advertise, CLAUDE, CODEX, freshRegistry, installFakeAgent, installFakeHub } from './fakeAgent.testing.ts';
import type { McpReceived } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

const HUB_TOOLS_META = 'mcp__hoa-hub__submit_handoff';

const hubServerNames = (received: McpReceived) => (received.servers as readonly { name: string }[]).map(s => s.name);
const allowedTools = (received: McpReceived): readonly string[] | undefined =>
  (received.meta as { claudeCode?: { options?: { allowedTools?: readonly string[] } } } | undefined)?.claudeCode
    ?.options?.allowedTools;

const setup = Effect.fnUntraced(function* (options: { readonly failClaudeLoad?: boolean } = {}) {
  const runtime = createHostRuntime(mockHostLayer);
  const { cancelPromptAtomFn } = createChatAtoms(runtime);
  const atoms = createSessionLifecycleAtoms(runtime, cancelPromptAtomFn);
  const registry = yield* freshRegistry;
  yield* installFakeHub([]);
  const claudeReceived: McpReceived[] = [];
  const codexReceived: McpReceived[] = [];
  const calls: string[] = [];
  yield* installFakeAgent(calls, { failLoad: options.failClaudeLoad, mcp: { received: claudeReceived } }, CLAUDE);
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
  const reload = runAtomFn(registry, atoms.reloadActiveSessionsAtomFn, undefined);
  return { calls, claudeReceived, codexReceived, registry, reload };
});

describe('reloadActiveSessionsAtomFn', () => {
  it.effect(
    'turning the setting on: reloaded sessions carry the hub server and, for Claude, the tool pre-approval',
    () =>
      Effect.gen(function* () {
        const s = yield* setup();
        setHubAvailability({ _tag: 'unavailable', reason: 'off' });
        // The setting flips on: the hub becomes available, then the reload runs.
        setHubAvailability({ _tag: 'available' });
        s.registry.set(selectedAtom, { _tag: 'Session', sessionId: 'c1' });
        yield* s.reload;

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

  it.effect('turning the setting off: reloaded sessions carry no mcpServers and no tool pre-approval', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      setHubAvailability({ _tag: 'unavailable', reason: 'Experimental: App Orchestrated Agents is off in Settings.' });
      yield* s.reload;

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

  it.effect('a session/new after the change follows the new state', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      setHubAvailability({ _tag: 'unavailable', reason: 'off' });
      yield* s.reload;
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
      yield* s.reload;
      assert.notInclude(s.calls, 'load:child');
      assert.include(s.calls, 'load:c1');
    }).pipe(Effect.scoped),
  );

  it.effect('one session failing to reload does not block the others', () =>
    Effect.gen(function* () {
      const s = yield* setup({ failClaudeLoad: true });
      yield* s.reload;
      assert.include(s.calls, 'load:c1');
      assert.include(s.calls, 'load:x1');
      assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.x1?.status, 'active');
    }).pipe(Effect.scoped),
  );
});
