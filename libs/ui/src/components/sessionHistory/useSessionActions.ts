import { useAtomSet, useAtomValue } from '@effect/atom-react';

import { backendHarnessSnapshotAtom } from '../../atoms/backendState.atoms.ts';
import {
  activateSessionAtomFn,
  archiveSessionAtomFn,
  deactivateSessionAtomFn,
  pinSessionAtomFn,
  unpinSessionAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from '../../atoms/pinnedSessions.atoms.ts';
import { isUsablePhase } from '../../host/acpSessionBootstrap.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { isArchivedEntry } from '../../host/airMeta.ts';

import { isSessionHistoryEntryAvailable } from './isSessionHistoryEntryAvailable.ts';
import { noopClientError } from './noopClientError.ts';
import { sessionActionAvailability } from './sessionActionAvailability.ts';

/**
 * Session actions for one History entry: which show / are disabled, plus the RPC-backed `run` of each. Rename has no
 * `run` (the host decides when editing starts). Shared by `SessionActionsMenu` and the Session header buttons.
 */
export const useSessionActions = ({
  canRename,
  entry,
  onBeforeAction,
  onClientError = noopClientError,
}: {
  readonly canRename: boolean;
  readonly entry: UnifiedHistoryEntry;
  readonly onBeforeAction?: () => void;
  readonly onClientError?: (error: unknown) => void;
}) => {
  const snapshot = useAtomValue(backendHarnessSnapshotAtom(entry.launchTarget));
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const archiveSession = useAtomSet(archiveSessionAtomFn, { mode: 'promise' });
  const deactivateSession = useAtomSet(deactivateSessionAtomFn, { mode: 'promise' });
  const pinSession = useAtomSet(pinSessionAtomFn, { mode: 'promise' });
  const unpinSession = useAtomSet(unpinSessionAtomFn, { mode: 'promise' });
  const pinsLoaded = useAtomValue(pinsLoadedAtom(entry.launchTarget));
  const pinned = useAtomValue(pinnedSessionsAtom(entry.launchTarget)).some(pin => pin.sessionId === entry.sessionId);

  const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
  const target = { launchTarget: entry.launchTarget, sessionId: entry.sessionId };
  const availability = sessionActionAvailability({
    archived: isArchivedEntry(entry),
    canRename,
    capabilities: snapshot.agentCapabilities,
    entryUnavailable: entry.unavailable === true,
    pinsLoaded,
    sessionActive: session?.status === 'active',
    unavailable: !isSessionHistoryEntryAvailable(entry, snapshot.phase),
    usablePhase: isUsablePhase(snapshot.phase),
  });

  return {
    ...availability,
    pinned,
    // Opens this session, so no onBeforeAction (it may select Virtual).
    runUnarchive: () => {
      activateSession(target).catch(onClientError);
    },
    // Pinning is local-only: it works for unavailable rows and must not run onBeforeAction.
    runPin: () => {
      (pinned ? unpinSession(target) : pinSession({ ...target, cwd: entry.cwd })).catch(onClientError);
    },
    runClose: () => {
      onBeforeAction?.();
      deactivateSession(target).catch(onClientError);
    },
    runArchive: () => {
      onBeforeAction?.();
      archiveSession(target).catch(onClientError);
    },
  };
};
