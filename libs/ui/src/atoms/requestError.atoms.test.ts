/** A Config change or Fork the Agent rejects shows its Request error in the Session's chat instead of failing the atom fn. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { SessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { advertise, CODEX, enableProviders, freshRegistry, installFakeAgent, REJECTION } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.testing.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

const advertisesFork = { agentCapabilities: { sessionCapabilities: { fork: {} } } };

const activeSession = (): SessionSnapshot => ({
  ...initialSessionSnapshot('s1', 'active'),
  configuration: [
    {
      choices: [
        { id: 'gpt', name: 'gpt' },
        { id: 'o1', name: 'o1' },
      ],
      currentValue: 'gpt',
      id: 'model',
      name: 'Model',
      type: 'select',
    },
  ],
  cwd: '/proj',
});

const setup = Effect.fnUntraced(function* (fake: FakeAgentOpts) {
  const calls: string[] = [];
  const registry = yield* freshRegistry;
  enableProviders(registry, [CODEX]);
  yield* installFakeAgent(calls, fake);
  const runtime = createHostRuntime(mockHostLayer);
  const chat = createChatAtoms(runtime);
  const lifecycle = createSessionLifecycleAtoms(runtime, () => Effect.void);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [{ cwd: '/proj', sessionId: 's1', title: 'Chat' }],
    sessions: { s1: activeSession() },
  }));
  advertise(registry, CODEX, advertisesFork);
  registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
  const session = () => registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.s1;
  const requestErrors = () => session().transcript.items.flatMap(item => (item.kind === 'request_error' ? [item] : []));
  return { calls, chat, lifecycle, registry, requestErrors, session };
});

const expectedItem = (method: string) => ({
  code: REJECTION.code,
  details: REJECTION.data.details,
  kind: 'request_error' as const,
  message: REJECTION.message,
  method,
});

describe('Request error from a session request the chat started', () => {
  it.effect('a Config change the Agent rejects is reverted and shown in the chat, not thrown', () =>
    Effect.gen(function* () {
      const s = yield* setup({ rejectSetConfig: true });
      yield* runAtomFn(s.registry, s.chat.setConfigOptionAtomFn, {
        configId: 'model',
        launchTarget: CODEX,
        type: 'select',
        value: 'o1',
      });

      assert.deepStrictEqual(s.calls, ['set:model:o1']);
      assert.deepStrictEqual(
        s.requestErrors().map(({ id: _id, ...rest }) => rest),
        [expectedItem('session/set_config_option')],
      );
      assert.strictEqual(s.session().configuration?.find(option => option.id === 'model')?.currentValue, 'gpt');
      assert.isUndefined(s.session().pendingClientRequest);
    }).pipe(Effect.scoped),
  );

  it.effect('a Fork the Agent rejects is shown in the source chat, not thrown, and activates nothing', () =>
    Effect.gen(function* () {
      const s = yield* setup({ rejectFork: true });
      yield* runAtomFn(s.registry, s.lifecycle.forkSessionAtomFn, {
        cwd: '/proj',
        launchTarget: CODEX,
        sessionId: 's1',
      });

      assert.deepStrictEqual(s.calls, ['fork:s1']);
      assert.deepStrictEqual(
        s.requestErrors().map(({ id: _id, ...rest }) => rest),
        [expectedItem('session/fork')],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('a failure that is not an Agent response still fails the Config change', () =>
    Effect.gen(function* () {
      const s = yield* setup({ failSetConfig: true });
      const exit = yield* Effect.exit(
        runAtomFn(s.registry, s.chat.setConfigOptionAtomFn, {
          configId: 'model',
          launchTarget: CODEX,
          type: 'select',
          value: 'o1',
        }),
      );

      assert.isTrue(exit._tag === 'Failure');
      assert.deepStrictEqual(s.requestErrors(), []);
    }).pipe(Effect.scoped),
  );
});
