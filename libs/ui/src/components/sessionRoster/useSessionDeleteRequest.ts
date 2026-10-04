import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { useState } from 'react';

import { confirmSessionDeleteAtom, deleteSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import type { UnifiedRosterEntry } from '../../host/acpSessionBootstrap.ts';

import { noopClientError } from './noopClientError.ts';

export const useSessionDeleteRequest = (
  onClientError: (error: unknown) => void = noopClientError,
): {
  readonly clearDeleteTarget: () => void;
  readonly deleteTarget: undefined | UnifiedRosterEntry;
  readonly requestDelete: (entry: UnifiedRosterEntry) => void;
} => {
  const confirmSessionDelete = useAtomValue(confirmSessionDeleteAtom);
  const deleteSession = useAtomSet(deleteSessionAtomFn, { mode: 'promise' });
  const [deleteTarget, setDeleteTarget] = useState<undefined | UnifiedRosterEntry>(undefined);

  const requestDelete = (entry: UnifiedRosterEntry) => {
    if (confirmSessionDelete) {
      setDeleteTarget(entry);
      return;
    }
    deleteSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(onClientError);
  };

  const clearDeleteTarget = () => {
    setDeleteTarget(undefined);
  };

  return { clearDeleteTarget, deleteTarget, requestDelete };
};
