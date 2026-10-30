import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { useState } from 'react';

import { confirmSessionDeleteAtom, deleteSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';

import { noopClientError } from './noopClientError.ts';

export const useSessionDeleteRequest = (
  onClientError: (error: unknown) => void = noopClientError,
): {
  readonly clearDeleteTarget: () => void;
  readonly deleteTarget: undefined | UnifiedHistoryEntry;
  readonly requestDelete: (entry: UnifiedHistoryEntry) => void;
} => {
  const confirmSessionDelete = useAtomValue(confirmSessionDeleteAtom);
  const deleteSession = useAtomSet(deleteSessionAtomFn, { mode: 'promise' });
  const [deleteTarget, setDeleteTarget] = useState<undefined | UnifiedHistoryEntry>(undefined);

  const requestDelete = (entry: UnifiedHistoryEntry) => {
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
