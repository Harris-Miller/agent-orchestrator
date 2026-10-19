/** Selected session's preloaded recursive `@` FS listing (key + atom value). */
import { useAtomValue } from '@effect/atom-react';

import {
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  unifiedSessionRosterAtom,
} from './backendState.atoms.ts';
import { sessionFsListingAtom, sessionFsListingKey } from './sessionFsListing.atoms.ts';
import type { SessionFsListingState } from './sessionFsListing.atoms.ts';

export type SelectedSessionFsListing = {
  readonly fsListing: SessionFsListingState;
  readonly listingKey: null | string;
  readonly selectedSessionId: string | undefined;
  readonly sessionCwd: string | undefined;
  readonly sourceCwd: string | undefined;
};

/** Resolve listing key from selected session + roster cwd fallback, then read the cache atom. */
export const useSelectedSessionFsListing = (): SelectedSessionFsListing => {
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const selectedLaunchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const roster = useAtomValue(unifiedSessionRosterAtom);

  const sourceCwd =
    selectedLaunchTarget === undefined || selectedSessionId === undefined
      ? undefined
      : roster.find(entry => entry.launchTarget === selectedLaunchTarget && entry.sessionId === selectedSessionId)?.cwd;
  const sessionCwd = selectedSession?.cwd ?? sourceCwd;
  const listingKey =
    selectedSessionId !== undefined && sessionCwd !== undefined
      ? sessionFsListingKey(selectedSessionId, sessionCwd)
      : null;
  const fsListing = useAtomValue(sessionFsListingAtom(listingKey ?? '\0'));

  return { fsListing, listingKey, selectedSessionId, sessionCwd, sourceCwd };
};
