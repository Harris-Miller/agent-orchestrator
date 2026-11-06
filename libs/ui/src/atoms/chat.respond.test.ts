import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { PendingPermission } from '../host/pendingInteractions.ts';

import { backendHarnessStateAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';

const LT = 'codex-acp' as const;

const setup = Effect.fnUntraced(function* () {
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), r =>
    Effect.sync(() => {
      r.dispose();
    }),
  );
  const { respondPermissionAtomFn } = createChatAtoms(createHostRuntime(mockHostLayer));
  registry.mount(respondPermissionAtomFn);
  const fold = makeHarnessEventFold({
    launchTarget: LT,
    refreshFsListing: () => Effect.void,
    registry,
    runFork: () => undefined,
  });
  return { fold, registry, respondPermissionAtomFn };
});

describe('respondPermissionAtomFn', () => {
  it.effect('keeps what the agent reported as soon as the permission was answered', () =>
    Effect.gen(function* () {
      const { fold, registry, respondPermissionAtomFn } = yield* setup();
      const pendingPermission: PendingPermission = {
        request: {} as PendingPermission['request'],
        // The agent resumes the turn the moment it is answered; its next session/update is folded right away.
        resolve: () => {
          fold.onSessionUpdate('s1', {
            content: { text: 'resumed', type: 'text' },
            sessionUpdate: 'agent_message_chunk',
          });
        },
        sessionId: 's1',
      };
      updateHarnessSnapshot(registry, LT, current => ({
        ...current,
        phase: 'ready',
        sessions: { s1: { ...initialSessionSnapshot('s1', 'active'), pendingPermission } },
      }));

      yield* runAtomFn(registry, respondPermissionAtomFn, { launchTarget: LT, optionId: 'allow', sessionId: 's1' });

      const session = registry.get(backendHarnessStateAtom(LT)).sessions.s1;
      assert.isUndefined(session.pendingPermission);
      assert.deepStrictEqual(
        session.transcript.items.map(item => item.kind),
        ['agent_message'],
      );
    }),
  );
});
