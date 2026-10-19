/** Selected session's preloaded recursive `@` FS listing (key + atom value). */
import { useAtomValue } from '@effect/atom-react';

import { sessionFsListingAtom, sessionFsListingKey } from './sessionFsListing.atoms.ts';
import type { SessionFsListingState } from './sessionFsListing.atoms.ts';
import { selectedActiveSessionAtom } from './virtualSession.atoms.ts';

export type SelectedSessionFsListing = {
  readonly fsListing: SessionFsListingState;
  readonly listingKey: null | string;
  readonly selectedSessionId: string | undefined;
  readonly sessionCwd: string | undefined;
  readonly sourceCwd: string | undefined;
};

/** Resolve listing key from selected Active session (Session arm or Bound Virtual). */
export const useSelectedSessionFsListing = (): SelectedSessionFsListing => {
  const active = useAtomValue(selectedActiveSessionAtom);
  const selectedSessionId = active?.sessionId;
  const sessionCwd = active?.cwd;
  const sourceCwd = sessionCwd;
  const listingKey =
    selectedSessionId !== undefined && sessionCwd !== undefined
      ? sessionFsListingKey(selectedSessionId, sessionCwd)
      : null;
  const fsListing = useAtomValue(sessionFsListingAtom(listingKey ?? '\0'));

  return { fsListing, listingKey, selectedSessionId, sessionCwd, sourceCwd };
};
