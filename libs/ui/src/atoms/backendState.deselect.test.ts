import { assert, describe, it } from '@effect/vitest';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { findLaunchTargetForSessionId, visibleSessionHistoryAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { userSettingsDocumentAtom } from './userSettings/userSettingsDocument.atoms.ts';

const snapshotWith = (archived: boolean, loaded: boolean): BackendHarnessSnapshot => ({
  ...initialBackendHarnessSnapshot(),
  sessionHistory: [{ ...(archived ? { archived: true as const } : {}), cwd: '/x', sessionId: 's1' }],
  sessions: loaded ? { s1: initialSessionSnapshot('s1') } : {},
});

const find = (snapshot: BackendHarnessSnapshot, showArchived = false) =>
  findLaunchTargetForSessionId((_target: AgentLaunchTarget) => snapshot, 's1', showArchived);

describe('findLaunchTargetForSessionId', () => {
  it('finds a visible history row', () => {
    assert.isDefined(find(snapshotWith(false, false)));
  });

  it('finds a loaded session without a history row', () => {
    assert.isDefined(find({ ...snapshotWith(false, true), sessionHistory: [] }));
  });

  it('treats an archived row as missing even when the session is loaded, while Show archived is off', () => {
    assert.isUndefined(find(snapshotWith(true, true)));
  });

  it('finds an archived row while Show archived is on', () => {
    assert.isDefined(find(snapshotWith(true, false), true));
  });
});

describe('visibleSessionHistoryAtom', () => {
  it('follows the Show archived User setting', () => {
    const registry = AtomRegistry.make();
    updateHarnessSnapshot(registry, 'codex-acp', current => ({
      ...current,
      sessionHistory: [
        { cwd: '/x', sessionId: 'live' },
        { archived: true, cwd: '/x', sessionId: 'archived' },
      ],
    }));
    const visibleIds = () => registry.get(visibleSessionHistoryAtom).map(entry => entry.sessionId);

    assert.deepStrictEqual(visibleIds(), ['live']);
    registry.set(userSettingsDocumentAtom, AsyncResult.success({ showArchived: true }));
    assert.deepStrictEqual(visibleIds(), ['live', 'archived']);
    registry.dispose();
  });
});
