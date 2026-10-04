import { useAtomSet } from '@effect/atom-react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { deleteSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import type { UnifiedRosterEntry } from '../../host/acpSessionBootstrap.ts';

import { truncateSessionId } from './truncateSessionId.ts';

const noopClientError = (_error: unknown): void => undefined;

export const ConfirmSessionDeleteDialog: FC<{
  readonly onCancel: () => void;
  readonly onClientError?: (error: unknown) => void;
  readonly target: undefined | UnifiedRosterEntry;
}> = ({ onCancel, onClientError = noopClientError, target }) => {
  const deleteSession = useAtomSet(deleteSessionAtomFn, { mode: 'promise' });

  return (
    <Dialog onClose={onCancel} open={target !== undefined}>
      <DialogTitle>Delete session?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This will permanently delete session{' '}
          <Typography component="span" sx={{ fontFamily: 'monospace' }}>
            {target !== undefined ? truncateSessionId(target.sessionId) : ''}
          </Typography>
          . This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          color="error"
          onClick={() => {
            if (target === undefined) {
              return;
            }
            const { launchTarget, sessionId } = target;
            deleteSession({ launchTarget, sessionId }).then(onCancel).catch(onClientError);
          }}
          variant="contained"
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};
