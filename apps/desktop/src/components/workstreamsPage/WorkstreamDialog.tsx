import type { TrackerProvider, TrackerRef, Workstream } from '@lib/hoa-home';
import { FieldLabel } from '@lib/ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import type { FC } from 'react';

import { TrackerChip } from './TrackerChip.tsx';
import { TRACKER_LABEL, TRACKER_PROVIDERS } from './workstreamViews.ts';

const sameRef = (a: TrackerRef, b: TrackerRef): boolean => a.provider === b.provider && a.key === b.key;

/** Create a Workstream, or (with `workstream`) rename it and link / unlink Tracker refs. */
export const WorkstreamDialog: FC<{
  readonly onClose: () => void;
  readonly onSubmit: (value: { readonly name: string; readonly trackers: readonly TrackerRef[] }) => void;
  readonly workstream?: Workstream;
}> = ({ onClose, onSubmit, workstream }) => {
  const [name, setName] = useState(workstream?.name ?? '');
  const [trackers, setTrackers] = useState<readonly TrackerRef[]>(workstream?.trackers ?? []);
  const [provider, setProvider] = useState<TrackerProvider>('github');
  const [key, setKey] = useState('');
  const trimmedKey = key.trim();
  const addTracker = () => {
    if (trimmedKey === '') return;
    const ref: TrackerRef = { key: trimmedKey, provider };
    setTrackers(current => (current.some(item => sameRef(item, ref)) ? current : [...current, ref]));
    setKey('');
  };
  return (
    <Dialog fullWidth maxWidth="xs" onClose={onClose} open>
      <DialogTitle>{workstream === undefined ? 'New Workstream' : 'Edit Workstream'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
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
          <FieldLabel fullWidth htmlFor="workstream-tracker-key" label="Tracker">
            <Stack direction="row" spacing={1}>
              <Select
                inputProps={{ 'aria-label': 'Tracker provider' }}
                onChange={event => {
                  setProvider(event.target.value);
                }}
                size="small"
                value={provider}
              >
                {TRACKER_PROVIDERS.map(candidate => (
                  <MenuItem key={candidate} value={candidate}>
                    {TRACKER_LABEL[candidate]}
                  </MenuItem>
                ))}
              </Select>
              <TextField
                id="workstream-tracker-key"
                onChange={event => {
                  setKey(event.target.value);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTracker();
                  }
                }}
                placeholder="Issue key or URL"
                size="small"
                sx={{ flex: 1 }}
                value={key}
              />
              <Button disabled={trimmedKey === ''} onClick={addTracker}>
                Add
              </Button>
            </Stack>
          </FieldLabel>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {trackers.map(ref => (
              <TrackerChip
                key={`${ref.provider}:${ref.key}`}
                onDelete={() => {
                  setTrackers(current => current.filter(item => !sameRef(item, ref)));
                }}
                trackerRef={ref}
              />
            ))}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          disabled={name.trim() === ''}
          onClick={() => {
            onSubmit({ name: name.trim(), trackers });
          }}
        >
          {workstream === undefined ? 'Create' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
