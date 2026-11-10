import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { useEffect } from 'react';
import type { FC } from 'react';

import { alwaysHiddenGlobsAtom, refreshSessionFsListingAtomFn } from '../atoms/boundHarnessAtoms.ts';
import { selectedActiveSessionAtom } from '../atoms/selectedActiveSession.atoms.ts';

/**
 * The one trigger of the `@` FS listing: it loads for the Selected active session (an active Session, or the Bound
 * Virtual one) and again when Always-hidden globs change. Bind and activation do not start or wait on it.
 */
export const SelectedSessionFsListingMount: FC = () => {
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

  return null;
};
