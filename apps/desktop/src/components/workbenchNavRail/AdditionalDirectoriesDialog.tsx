import { directoryBasename, LucideMuiIcon } from '@lib/ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { FolderPlus, X } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { CreateSessionDirectoryPicker } from './CreateSessionDirectoryPicker.tsx';

/** Edits a list of Additional directories (add through the directory picker, remove); the caller decides where Save writes it. */
export const AdditionalDirectoriesDialog: FC<{
  readonly description: string;
  readonly initial: readonly string[];
  readonly onClose: () => void;
  /** Present when the list has a default to go back to (a session's Project defaults). */
  readonly onReset?: () => void;
  readonly onSave: (directories: readonly string[]) => void;
  readonly title: string;
}> = ({ description, initial, onClose, onReset, onSave, title }) => {
  const [directories, setDirectories] = useState<readonly string[]>(initial);
  const [picking, setPicking] = useState(false);

  return (
    <>
      <Dialog fullWidth maxWidth="sm" onClose={onClose} open>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>{description}</DialogContentText>
          {directories.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              None
            </Typography>
          ) : (
            directories.map(directory => (
              <Box key={directory} sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                <Typography noWrap sx={{ flex: 1, minWidth: 0 }} title={directory} variant="body2">
                  {directoryBasename(directory)}
                  <Typography color="text.secondary" component="span" sx={{ ml: 1 }} variant="caption">
                    {directory}
                  </Typography>
                </Typography>
                <IconButton
                  aria-label={`Remove ${directory}`}
                  onClick={() => {
                    setDirectories(current => current.filter(item => item !== directory));
                  }}
                  size="small"
                >
                  <LucideMuiIcon fontSize="small" icon={X} />
                </IconButton>
              </Box>
            ))
          )}
          <Button
            onClick={() => {
              setPicking(true);
            }}
            size="small"
            startIcon={<LucideMuiIcon fontSize="small" icon={FolderPlus} />}
            sx={{ mt: 1, textTransform: 'none' }}
          >
            Add directory…
          </Button>
        </DialogContent>
        <DialogActions>
          {onReset === undefined ? null : (
            <Button
              onClick={() => {
                onReset();
                onClose();
              }}
              sx={{ mr: 'auto' }}
            >
              Reset to Project defaults
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              onSave(directories);
              onClose();
            }}
            variant="contained"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      {picking ? (
        <CreateSessionDirectoryPicker
          allowWorkspaceFile={false}
          confirmLabel="Add"
          onClose={() => {
            setPicking(false);
          }}
          onSelectDirectory={directory => {
            setDirectories(current => (current.includes(directory) ? current : [...current, directory]));
          }}
        />
      ) : null}
    </>
  );
};
