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
}> = ({ count, onCancel, onConfirm }) => (
  <Dialog onClose={onCancel} open={count > 0}>
    <DialogTitle>Delete {count} sessions?</DialogTitle>
    <DialogContent>
      <DialogContentText>
        This will permanently delete {count} sessions. This action cannot be undone.
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
