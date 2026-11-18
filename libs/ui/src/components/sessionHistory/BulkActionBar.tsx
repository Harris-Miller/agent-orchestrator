import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC } from 'react';

import { archiveCapableLaunchTargetsAtom } from '../../atoms/backendState.atoms.ts';
import {
  archiveSessionsAtomFn,
  confirmSessionDeleteAtom,
  deleteSessionAtomFn,
  unarchiveSessionsAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';

import { partitionForBulk } from './bulkSelection.ts';
import { ConfirmBulkSessionDeleteDialog } from './ConfirmBulkSessionDeleteDialog.tsx';
import { noopClientError } from './noopClientError.ts';
import type { BulkSessionSelection } from './useBulkSessionSelection.ts';

const targetOf = ({ launchTarget, sessionId }: UnifiedHistoryEntry) => ({ launchTarget, sessionId });

/** Shown while Bulk select is active: selection count, Select all / Clear, and the Bulk actions. Each action then leaves Bulk select. */
export const BulkActionBar: FC<{
  readonly onClientError?: (error: unknown) => void;
  readonly selection: BulkSessionSelection;
}> = ({ onClientError = noopClientError, selection }) => {
  const archiveSessions = useAtomSet(archiveSessionsAtomFn, { mode: 'promise' });
  const unarchiveSessions = useAtomSet(unarchiveSessionsAtomFn, { mode: 'promise' });
  const deleteSession = useAtomSet(deleteSessionAtomFn, { mode: 'promise' });
  const confirmSessionDelete = useAtomValue(confirmSessionDeleteAtom);
  const archiveCapable = useAtomValue(archiveCapableLaunchTargetsAtom);
  const [confirmingDelete, setConfirmingDelete] = useState<readonly UnifiedHistoryEntry[]>([]);

  if (!selection.active) return null;

  const { all, archivable, unarchivable } = partitionForBulk(selection.selectedEntries, entry =>
    archiveCapable.has(entry.launchTarget),
  );

  const runDelete = (entries: readonly UnifiedHistoryEntry[]) => {
    Promise.allSettled(entries.map(entry => deleteSession(targetOf(entry)))).then(results => {
      const rejected = results.find(result => result.status === 'rejected');
      if (rejected !== undefined) onClientError(rejected.reason);
    }, onClientError);
    selection.toggleMode();
  };

  return (
    <>
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5, px: 1.5, py: 0.5 }}>
        <Typography sx={{ mr: 'auto' }} variant="body2">
          {all.length} selected
        </Typography>
        <Button onClick={selection.selectAll} size="small">
          Select all
        </Button>
        <Button disabled={all.length === 0} onClick={selection.clear} size="small">
          Clear
        </Button>
        {archivable.length > 0 ? (
          <Button
            onClick={() => {
              archiveSessions(archivable.map(targetOf)).catch(onClientError);
              selection.toggleMode();
            }}
            size="small"
            variant="outlined"
          >
            Archive ({archivable.length})
          </Button>
        ) : null}
        {unarchivable.length > 0 ? (
          <Button
            onClick={() => {
              unarchiveSessions(unarchivable.map(targetOf)).catch(onClientError);
              selection.toggleMode();
            }}
            size="small"
            variant="outlined"
          >
            Unarchive ({unarchivable.length})
          </Button>
        ) : null}
        {all.length > 0 ? (
          <Button
            color="error"
            onClick={() => {
              if (confirmSessionDelete) setConfirmingDelete(all);
              else runDelete(all);
            }}
            size="small"
            variant="outlined"
          >
            Delete ({all.length})
          </Button>
        ) : null}
      </Stack>
      <ConfirmBulkSessionDeleteDialog
        count={confirmingDelete.length}
        onCancel={() => {
          setConfirmingDelete([]);
        }}
        onConfirm={() => {
          runDelete(confirmingDelete);
          setConfirmingDelete([]);
        }}
      />
    </>
  );
};
