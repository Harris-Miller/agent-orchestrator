import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import type { FC } from 'react';

/** One confirmation for deleting `count` checked sessions; `count` is 0 while closed. */
export const ConfirmBulkSessionDeleteDialog: FC<{
  readonly count: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}> = ({ count, onCancel, onConfirm }) => {
  const noun = count === 1 ? 'session' : 'sessions';
  return (
    <Dialog onClose={onCancel} open={count > 0}>
      <DialogTitle>
        Delete {count} {noun}?
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          This will permanently delete {count} {noun}. This action cannot be undone. Where the agent cannot delete
          sessions, the transcript stays on the agent and the session is only removed from this app.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button color="error" onClick={onConfirm} variant="contained">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};
