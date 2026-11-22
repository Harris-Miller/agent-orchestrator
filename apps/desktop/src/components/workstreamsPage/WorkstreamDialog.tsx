import type { Workstream } from '@lib/hoa-home';
import { FieldLabel } from '@lib/ui';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import type { FC } from 'react';

/** Create a Workstream, or (with `workstream`) rename it. */
export const WorkstreamDialog: FC<{
  readonly onClose: () => void;
  readonly onSubmit: (name: string) => void;
  readonly workstream?: Workstream;
}> = ({ onClose, onSubmit, workstream }) => {
  const [name, setName] = useState(workstream?.name ?? '');
  return (
    <Dialog fullWidth maxWidth="xs" onClose={onClose} open>
      <DialogTitle>{workstream === undefined ? 'New Workstream' : 'Rename Workstream'}</DialogTitle>
      <DialogContent>
        <FieldLabel fullWidth htmlFor="workstream-name" label="Name">
          <TextField
            autoFocus
            fullWidth
            id="workstream-name"
            onChange={event => {
              setName(event.target.value);
            }}
            size="small"
            value={name}
          />
        </FieldLabel>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          disabled={name.trim() === ''}
          onClick={() => {
            onSubmit(name.trim());
          }}
        >
          {workstream === undefined ? 'Create' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
