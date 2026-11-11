import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { useEffect } from 'react';

import { alwaysHiddenGlobsAtom, refreshSessionFsListingAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { selectedActiveSessionAtom } from '../../atoms/selectedActiveSession.atoms.ts';

/**
 * The one trigger of the `@` FS listing: it loads once the Selected active session (an active Session, or the Bound
 * Virtual one) has an id and a cwd, and again when Always-hidden globs change. Call it once, from the chat surface.
 */
export const usePreloadSessionFsListing = (): void => {
  const active = useAtomValue(selectedActiveSessionAtom);
  const alwaysHiddenGlobs = useAtomValue(alwaysHiddenGlobsAtom);
  const refreshSessionFsListing = useAtomSet(refreshSessionFsListingAtomFn, { mode: 'promise' });
  const sessionId = active?.sessionId;
  const cwd = active?.cwd;

  useEffect(() => {
    if (sessionId === undefined || cwd === undefined) {
      return;
    }
    refreshSessionFsListing({ cwd, sessionId }).catch(() => undefined);
  }, [alwaysHiddenGlobs, cwd, refreshSessionFsListing, sessionId]);
};
