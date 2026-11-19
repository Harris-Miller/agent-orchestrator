/** Test support for the Hub's subagent tools: a Codex parent holding a hub credential and a Claude child target. */
import type { HostServices } from '@lib/context-services';
import { Effect } from 'effect';

import {
  advertise,
  bearerOf,
  CLAUDE,
  CODEX,
  freshRegistry,
  installFakeAgent,
  installFakeHub,
} from '../atoms/fakeAgent.testing.ts';
import type { FakeAgentOpts, McpReceived } from '../atoms/fakeAgent.testing.ts';
import { configOptionIndexAtom } from '../atoms/backendState.atoms.ts';
import { makeHarnessEventFold } from '../atoms/harnessEventFold.ts';
import { updateHarnessSnapshot } from '../atoms/harnessSnapshot.ts';
import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';
import { endLink } from '../atoms/spawnedSubagent.ts';
import { allLinks } from '../atoms/subagentLinkRegistry.ts';

import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { configOptionIndexFromProbeResponses } from './configOptionIndexFixtures.ts';
import { handleHubToolCall } from './hubSessions.ts';
import { createSession } from './sessionRpc.ts';

export const CHILD = 'claude-1';
export const PARENT = 'bound-1';

const model = (id: string) => ({
  currentValue: id,
  id: 'model',
  name: 'Model',
  options: [
    { name: 'gpt', value: 'gpt' },
    { name: 'o1', value: 'o1' },
  ],
  type: 'select',
});

const childIndex = configOptionIndexFromProbeResponses('gpt', {
  gpt: { configOptions: [model('gpt')] },
  o1: { configOptions: [model('o1')] },
});

export const answer = (value: string) => ({
  content: { text: value, type: 'text' },
  sessionUpdate: 'agent_message_chunk',
});

/** A Codex parent holding a hub credential and a Claude child target, both with fake agents. */
export const setup = Effect.fnUntraced(function* (childOpts: FakeAgentOpts = {}, parentOpts: FakeAgentOpts = {}) {
  yield* installFakeHub([]);
  const registry = yield* freshRegistry;
  const received: McpReceived[] = [];
  const parentCalls: string[] = [];
  yield* installFakeAgent(parentCalls, { mcp: { received }, ...parentOpts });
  yield* createSession(CODEX, '/w');
  advertise(registry, CODEX, {});
  advertise(registry, CLAUDE, {});
  registry.set(configOptionIndexAtom(CLAUDE), childIndex);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [{ cwd: '/w', sessionId: PARENT, title: 'Parent' }],
    sessions: { [PARENT]: { ...initialSessionSnapshot(PARENT, 'active'), cwd: '/w' } },
  }));
  const childFold = makeHarnessEventFold({
    setModelPickerPrefs: () => undefined,
    launchTarget: CLAUDE,
    registry,
    runFork: () => undefined,
  });
  const childCalls: string[] = [];
  yield* installFakeAgent(childCalls, { reports: childFold, ...childOpts }, CLAUDE);
  yield* Effect.addFinalizer(() =>
    Effect.forEach(allLinks(registry), link =>
      endLink(registry, { launchTarget: link.childLaunchTarget, sessionId: link.childSessionId }),
    ),
  );
  const token = bearerOf(received[0].servers);
  const call = (tool: string, args: unknown): Effect.Effect<{ isError: boolean; text: string }> =>
    (
      handleHubToolCall({ args, token, tool }, { registry }) as Effect.Effect<
        { isError: boolean; text: string },
        never,
        HostServices
      >
    ).pipe(Effect.provide(mockHostLayer));
  const spawn = (extra: Record<string, unknown> = {}) =>
    call('spawn_subagent', {
      configOptions: { model: 'o1' },
      description: 'Review',
      launchTarget: CLAUDE,
      task: 'Review the diff',
      ...extra,
    });
  const setParent = (patch: Partial<ReturnType<typeof initialSessionSnapshot>>) => {
    updateHarnessSnapshot(registry, CODEX, current => ({
      ...current,
      sessions: { ...current.sessions, [PARENT]: { ...current.sessions[PARENT], ...patch } },
    }));
  };
  return { call, childCalls, childFold, parentCalls, registry, setParent, spawn };
});

export const until = (condition: () => boolean) =>
  Effect.yieldNow.pipe(Effect.repeat({ times: 200, until: () => condition() }), Effect.asVoid);
