import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { PendingElicitation, PendingPermission } from '../host/pendingInteractions.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.testing.ts';

const LT = 'codex-acp' as const;

const setup = Effect.fnUntraced(function* () {
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), r =>
    Effect.sync(() => {
      r.dispose();
    }),
  );
  const { cancelPromptAtomFn, respondElicitationAtomFn, respondPermissionAtomFn } = createChatAtoms(
    createHostRuntime(mockHostLayer),
  );
  registry.mount(cancelPromptAtomFn);
  registry.mount(respondElicitationAtomFn);
  registry.mount(respondPermissionAtomFn);
  const fold = makeHarnessEventFold({
    setModelPickerPrefs: () => undefined,
    launchTarget: LT,
    registry,
    runFork: () => undefined,
  });
  return { cancelPromptAtomFn, fold, registry, respondElicitationAtomFn, respondPermissionAtomFn };
});

const elicitationRequest = {} as PendingElicitation['request'];
const permissionRequest = { options: [] } as unknown as PendingPermission['request'];

describe('respondPermissionAtomFn', () => {
  it.effect('keeps what the agent reported as soon as the permission was answered', () =>
    Effect.gen(function* () {
      const { fold, registry, respondPermissionAtomFn } = yield* setup();
      const pendingPermission: PendingPermission = {
        request: permissionRequest,
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

      const session = registry.get(backendHarnessSnapshotAtom(LT)).sessions.s1;
      assert.isUndefined(session.pendingPermission);
      assert.deepStrictEqual(
        session.transcript.items.map(item => item.kind),
        ['agent_message'],
      );
    }),
  );
});

describe('respondElicitationAtomFn', () => {
  it.effect('appends the summary and keeps an elicitation the agent raised while the answer resolved', () =>
    Effect.gen(function* () {
      const { fold, registry, respondElicitationAtomFn } = yield* setup();
      const pendingElicitation: PendingElicitation = {
        id: 'e1',
        request: elicitationRequest,
        resolve: () => {
          fold.onElicitationCreate('s1', elicitationRequest, () => undefined);
        },
        sessionId: 's1',
      };
      updateHarnessSnapshot(registry, LT, current => ({
        ...current,
        phase: 'ready',
        sessions: { s1: { ...initialSessionSnapshot('s1', 'active'), pendingElicitation } },
      }));

      yield* runAtomFn(registry, respondElicitationAtomFn, {
        launchTarget: LT,
        response: { action: 'accept', content: {} },
        sessionId: 's1',
        summary: { message: 'Pick', rows: [{ caption: undefined, label: 'Color', note: undefined, value: 'red' }] },
      });

      const session = registry.get(backendHarnessSnapshotAtom(LT)).sessions.s1;
      assert.isDefined(session.pendingElicitation);
      assert.notStrictEqual(session.pendingElicitation, pendingElicitation);
      assert.deepStrictEqual(
        session.transcript.items.map(item => item.kind),
        ['elicitation_summary'],
      );
    }),
  );
});

describe('cancelPromptAtomFn', () => {
  it.effect('cancels the shown permission and every one waiting behind it', () =>
    Effect.gen(function* () {
      const { cancelPromptAtomFn, fold, registry } = yield* setup();
      updateHarnessSnapshot(registry, LT, current => ({
        ...current,
        phase: 'ready',
        sessions: { s1: { ...initialSessionSnapshot('s1', 'active'), pendingClientRequest: 'prompt' } },
      }));
      const answers: unknown[] = [];
      for (const name of ['first', 'second']) {
        fold.onPermissionRequest('s1', permissionRequest, response => {
          answers.push([name, response]);
        });
      }
      assert.strictEqual(registry.get(backendHarnessSnapshotAtom(LT)).sessions.s1.waitingPermissions?.length, 1);

      // No connected agent: session/cancel fails after the snapshot is written.
      yield* Effect.exit(runAtomFn(registry, cancelPromptAtomFn, { launchTarget: LT, sessionId: 's1' }));

      const session = registry.get(backendHarnessSnapshotAtom(LT)).sessions.s1;
      assert.strictEqual(session.pendingPermission, undefined);
      assert.strictEqual(session.waitingPermissions, undefined);
      assert.deepStrictEqual(answers, [
        ['first', { outcome: { outcome: 'cancelled' } }],
        ['second', { outcome: { outcome: 'cancelled' } }],
      ]);
    }),
  );

  it.effect('answering the shown permission shows the next one waiting', () =>
    Effect.gen(function* () {
      const { fold, registry, respondPermissionAtomFn } = yield* setup();
      updateHarnessSnapshot(registry, LT, current => ({
        ...current,
        phase: 'ready',
        sessions: { s1: { ...initialSessionSnapshot('s1', 'active'), pendingClientRequest: 'prompt' } },
      }));
      const answers: unknown[] = [];
      for (const name of ['first', 'second']) {
        fold.onPermissionRequest('s1', permissionRequest, response => {
          answers.push([name, response]);
        });
      }

      yield* runAtomFn(registry, respondPermissionAtomFn, { launchTarget: LT, optionId: 'allow', sessionId: 's1' });

      const session = registry.get(backendHarnessSnapshotAtom(LT)).sessions.s1;
      assert.isDefined(session.pendingPermission);
      assert.strictEqual(session.waitingPermissions, undefined);
      assert.deepStrictEqual(answers, [['first', { outcome: { optionId: 'allow', outcome: 'selected' } }]]);
    }),
  );

  it.effect('clears the cancelled permission but keeps one the agent raised while it resolved', () =>
    Effect.gen(function* () {
      const { cancelPromptAtomFn, fold, registry } = yield* setup();
      const answeredRaised: unknown[] = [];
      const raisedDuringResolve: PendingPermission['resolve'] = response => {
        answeredRaised.push(response);
      };
      const pendingPermission: PendingPermission = {
        request: permissionRequest,
        resolve: () => {
          fold.onPermissionRequest('s1', permissionRequest, raisedDuringResolve);
        },
        sessionId: 's1',
      };
      updateHarnessSnapshot(registry, LT, current => ({
        ...current,
        phase: 'ready',
        sessions: {
          s1: { ...initialSessionSnapshot('s1', 'active'), pendingClientRequest: 'prompt', pendingPermission },
        },
      }));

      // No connected agent: session/cancel fails after the snapshot is written.
      yield* Effect.exit(runAtomFn(registry, cancelPromptAtomFn, { launchTarget: LT, sessionId: 's1' }));

      const session = registry.get(backendHarnessSnapshotAtom(LT)).sessions.s1;
      assert.strictEqual(session.promptCancelRequested, true);
      // The one the agent raised while the first was cancelled is still pending and answers the agent's new request.
      session.pendingPermission?.resolve({ outcome: { optionId: 'allow', outcome: 'selected' } });
      assert.deepStrictEqual(answeredRaised, [{ outcome: { optionId: 'allow', outcome: 'selected' } }]);
    }),
  );
});
