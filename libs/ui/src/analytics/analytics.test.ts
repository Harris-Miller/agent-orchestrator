import { assert, describe, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { PendingElicitation, PendingPermission } from '../host/pendingInteractions.ts';
import { createChatAtoms } from '../atoms/chat.atoms.ts';
import { advertise, CODEX, freshRegistry, installFakeAgent } from '../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../atoms/harnessSnapshot.ts';
import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';
import { runAtomFn } from '../atoms/runAtomFn.testing.ts';
import { createSessionLifecycleAtoms } from '../atoms/sessionLifecycle.atoms.ts';

import { makeRecordingAnalytics, summarize } from './recordingAnalytics.testing.ts';
import { captureAppOpened, trackEvent } from './trackEvent.ts';
import { appOpened, sessionArchived } from './catalog.ts';

/** Planted in every free-text field the triggers can see; it must reach no event. */
const MARKER = 'CANARY-free-text-marker';

const setup = Effect.fnUntraced(function* () {
  const recording = makeRecordingAnalytics();
  const hostBag = createHostRuntime(Layer.merge(mockHostLayer, recording.layer));
  const registry = yield* freshRegistry;
  const calls: string[] = [];
  yield* installFakeAgent(calls);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    phase: 'ready',
    sessionHistory: [{ cwd: `/${MARKER}`, sessionId: 's1', title: MARKER }],
    sessions: { s1: { ...initialSessionSnapshot('s1', 'inactive'), cwd: `/${MARKER}` } },
  }));
  advertise(registry, CODEX, {});
  const lifecycle = createSessionLifecycleAtoms(hostBag, () => Effect.void);
  const chat = createChatAtoms(hostBag);
  return { chat, events: recording.events, lifecycle, registry };
});

const target = { launchTarget: CODEX, sessionId: 's1' };

describe('trackEvent', () => {
  it.effect('captures once the action succeeded', () =>
    Effect.gen(function* () {
      const recording = makeRecordingAnalytics();
      yield* Effect.succeed(1).pipe(trackEvent(sessionArchived(CODEX)), Effect.provide(recording.layer));
      assert.deepStrictEqual(summarize(recording.events), [
        { name: 'session_archived', properties: { launch_target: CODEX } },
      ]);
    }),
  );

  it.effect('captures nothing when the action fails', () =>
    Effect.gen(function* () {
      const recording = makeRecordingAnalytics();
      yield* Effect.flip(Effect.fail('boom').pipe(trackEvent(sessionArchived(CODEX)), Effect.provide(recording.layer)));
      assert.deepStrictEqual(recording.events, []);
    }),
  );

  it.effect('app_opened carries no properties', () =>
    Effect.gen(function* () {
      const recording = makeRecordingAnalytics();
      yield* captureAppOpened.pipe(Effect.provide(recording.layer));
      assert.deepStrictEqual(summarize(recording.events), [{ name: appOpened().name, properties: {} }]);
    }),
  );
});

describe('action triggers', () => {
  it.effect('archive, unarchive, delete and stop-tracking capture their events, and nothing free-text', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* runAtomFn(s.registry, s.lifecycle.archiveSessionAtomFn, target);
      yield* runAtomFn(s.registry, s.lifecycle.unarchiveSessionAtomFn, target);
      yield* runAtomFn(s.registry, s.lifecycle.stopTrackingProjectAtomFn, `/${MARKER}`);
      yield* runAtomFn(s.registry, s.lifecycle.deleteSessionAtomFn, target);
      assert.deepStrictEqual(summarize(s.events), [
        { name: 'session_archived', properties: { launch_target: CODEX } },
        { name: 'session_unarchived', properties: { launch_target: CODEX } },
        { name: 'project_tracking_stopped', properties: {} },
        { name: 'session_deleted', properties: { launch_target: CODEX } },
      ]);
      assert.notInclude(JSON.stringify(summarize(s.events)), MARKER);
    }).pipe(Effect.scoped),
  );

  it.effect('rename never carries the title', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      advertise(s.registry, CODEX, { _meta: { jetbrains: { air: { capabilities: ['sessionIndex'], version: 1 } } } });
      updateHarnessSnapshot(s.registry, CODEX, current => ({
        ...current,
        agentCapabilities: { ...current.agentCapabilities, sessionRename: true },
      }));
      yield* runAtomFn(s.registry, s.lifecycle.renameSessionAtomFn, { ...target, title: MARKER });
      assert.notInclude(JSON.stringify(summarize(s.events)), MARKER);
      assert.deepStrictEqual(summarize(s.events), [{ name: 'session_renamed', properties: { launch_target: CODEX } }]);
    }).pipe(Effect.scoped),
  );

  it.effect('cancelling a prompt captures prompt_cancelled with the launch target only', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* runAtomFn(s.registry, s.chat.cancelPromptAtomFn, target);
      assert.deepStrictEqual(summarize(s.events), [{ name: 'prompt_cancelled', properties: { launch_target: CODEX } }]);
    }).pipe(Effect.scoped),
  );

  it.effect('permission and elicitation replies carry only the option kind / mode and action', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const pendingPermission: PendingPermission = {
        request: {
          options: [{ kind: 'allow_once', name: MARKER, optionId: MARKER }],
          sessionId: 's1',
          toolCall: { title: MARKER, toolCallId: MARKER },
        } as unknown as PendingPermission['request'],
        resolve: () => undefined,
        sessionId: 's1',
      };
      const pendingElicitation: PendingElicitation = {
        id: 'e1',
        request: { message: MARKER, mode: 'form' },
        resolve: () => undefined,
        sessionId: 's1',
      };
      updateHarnessSnapshot(s.registry, CODEX, current => ({
        ...current,
        sessions: { s1: { ...current.sessions.s1, pendingElicitation, pendingPermission } },
      }));
      yield* runAtomFn(s.registry, s.chat.respondPermissionAtomFn, { ...target, optionId: MARKER });
      yield* runAtomFn(s.registry, s.chat.respondElicitationAtomFn, {
        ...target,
        response: { action: 'decline' },
      });
      assert.deepStrictEqual(summarize(s.events), [
        { name: 'permission_responded', properties: { option_kind: 'allow_once' } },
        { name: 'elicitation_responded', properties: { action: 'decline', mode: 'form' } },
      ]);
      assert.notInclude(JSON.stringify(summarize(s.events)), MARKER);
    }).pipe(Effect.scoped),
  );
});
