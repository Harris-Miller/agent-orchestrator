import { assert, describe, it } from '@effect/vitest';

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { findLaunchTargetForSessionId } from './backendState.atoms.ts';

const archivedMeta = { jetbrains: { air: { archived: true } } };

const snapshotWith = (archived: boolean, loaded: boolean): BackendHarnessSnapshot => ({
  ...initialBackendHarnessSnapshot(),
  sessionHistory: [{ _meta: archived ? archivedMeta : undefined, cwd: '/x', sessionId: 's1' }],
  sessions: loaded ? { s1: initialSessionSnapshot('s1') } : {},
});

const find = (snapshot: BackendHarnessSnapshot) =>
  findLaunchTargetForSessionId((_target: AgentLaunchTarget) => snapshot, 's1');

describe('findLaunchTargetForSessionId', () => {
  it('finds a visible history row', () => {
    assert.isDefined(find(snapshotWith(false, false)));
  });

  it('finds a loaded session without a history row', () => {
    assert.isDefined(find({ ...snapshotWith(false, true), sessionHistory: [] }));
  });

  it('treats an archived row as missing even when the session is loaded', () => {
    assert.isUndefined(find(snapshotWith(true, true)));
  });
});
