import { updateSessionIndex } from '@lib/hoa-home';
import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { indexRowsByCwd } from '../host/sessionIndexRows.ts';
import { hostRuntime } from '../hostRuntime.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { pinnedSessionsAtom } from './pinnedSessions.atoms.ts';

/**
 * Persists a launch target's Session History rows (for `listedCwds()` only) and pins to the session index whenever its
 * snapshot changes. Writes are serialized and skipped when unchanged; cwds this host does not list are never rewritten.
 * Returns the unsubscribe.
 */
export const startSessionIndexPersistence = (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  listedCwds: () => readonly string[],
): (() => void) => {
  const target = toLaunchTarget(launchTarget);
  let writes = Promise.resolve();
  let lastWritten = '';
  return registry.subscribe(backendHarnessSnapshotAtom(launchTarget), () => {
    writes = writes.then(() => {
      const current = registry.get(backendHarnessSnapshotAtom(launchTarget));
      const rowsByCwd = indexRowsByCwd(current.sessionHistory, listedCwds());
      const pinnedIds = new Set(registry.get(pinnedSessionsAtom(launchTarget)).map(pin => pin.sessionId));
      const nextJson = JSON.stringify([rowsByCwd, [...pinnedIds]]);
      if (nextJson === lastWritten) return;
      return hostRuntime
        .runPromise(updateSessionIndex(target, rowsByCwd, pinnedIds))
        .then(() => {
          lastWritten = nextJson;
        })
        .catch((cause: unknown) =>
          hostRuntime.runPromise(Effect.logWarning('session index persist failed', launchTarget, cause)),
        );
    });
  });
};
