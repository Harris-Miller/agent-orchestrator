/**
 * Handoff through its AtomFn, against a real registry, the Harness event fold and fake ACP agents on both launch
 * targets.
 */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { configValue } from '../host/sessionConfiguration.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { advertise, CLAUDE, CODEX, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { createHandoffAtoms } from './handoff.atoms.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';

describe('handoffSessionAtomFn', () => {
  it.effect('a session/update landing during the target Config diffs survives the Handoff', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      const foldFor = (launchTarget: AgentLaunchTarget) =>
        makeHarnessEventFold({ launchTarget, registry, runFork: () => undefined });
      const sourceFold = foldFor(CODEX);
      const targetFold = foldFor(CLAUDE);
      advertise(registry, CODEX, {});
      advertise(registry, CLAUDE, {});
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [{ cwd: '/w', sessionId: 's1', title: 'Source' }],
        sessions: { s1: initialSessionSnapshot('s1', 'active') },
      }));
      const sourceCalls: string[] = [];
      yield* installFakeAgent(sourceCalls, {
        duringPrompt: Effect.sync(() => {
          sourceFold.onSessionUpdate('s1', {
            content: { text: '<handoff>the plan</handoff>', type: 'text' },
            sessionUpdate: 'agent_message_chunk',
          });
        }),
      });
      const targetCalls: string[] = [];
      yield* installFakeAgent(
        targetCalls,
        {
          duringSetConfig: Effect.sync(() => {
            targetFold.onSessionUpdate('claude-1', {
              availableCommands: [{ description: 'Review the diff', name: 'review' }],
              sessionUpdate: 'available_commands_update',
            });
          }),
        },
        CLAUDE,
      );
      const { handoffSessionAtomFn } = createHandoffAtoms(createHostRuntime(mockHostLayer));
      registry.mount(handoffSessionAtomFn);

      yield* runAtomFn(registry, handoffSessionAtomFn, {
        configValues: { model: 'o1' },
        sourceLaunchTarget: CODEX,
        sourceSessionId: 's1',
        targetLaunchTarget: CLAUDE,
      });

      assert.deepStrictEqual(sourceCalls, ['prompt:s1']);
      assert.deepStrictEqual(targetCalls, ['new:claude', 'set:model:o1', 'prompt:claude-1']);
      assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 'claude-1' });
      const target = registry.get(backendHarnessSnapshotAtom(CLAUDE)).sessions['claude-1'];
      assert.strictEqual(configValue(target.configuration, 'model'), 'o1');
      assert.deepStrictEqual(target.availableCommands, [{ description: 'Review the diff', name: 'review' }]);
    }).pipe(Effect.scoped),
  );
});
