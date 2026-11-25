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

import { directoryBasename } from '../host/directoryBasename.ts';

import { useDirectoryPicker } from './DirectoryPickerContext.tsx';
import { LucideMuiIcon } from './LucideMuiIcon.tsx';

/**
 * Edits a list of Additional directories: remove entries, and add through the host's directory picker when it has one.
 * The caller decides where Save writes it. `facts` are read-only context lines (a session's cwd and Workspace file).
 */
export const AdditionalDirectoriesDialog: FC<{
  readonly description: string;
  readonly facts?: readonly { readonly label: string; readonly value: string }[];
  readonly initial: readonly string[];
  readonly onClose: () => void;
  /** Present when the list has something to go back to: the list "Reset to Project defaults" puts back (saved with Save). */
  readonly resetTo?: () => readonly string[];
  readonly onSave: (directories: readonly string[]) => void;
  readonly title: string;
}> = ({ description, facts = [], initial, onClose, onSave, resetTo, title }) => {
  const renderPicker = useDirectoryPicker();
  const [directories, setDirectories] = useState<readonly string[]>(initial);
  const [picking, setPicking] = useState(false);

  return (
    <>
      <Dialog fullWidth maxWidth="sm" onClose={onClose} open>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>{description}</DialogContentText>
          {facts.map(fact => (
            <Typography key={fact.label} sx={{ mb: 0.5 }} variant="body2">
              <Typography color="text.secondary" component="span" variant="caption">
                {fact.label}{' '}
              </Typography>
              {fact.value}
            </Typography>
          ))}
          <Typography color="text.secondary" sx={{ mt: 1 }} variant="caption">
            Additional directories
          </Typography>
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
          {renderPicker === undefined ? null : (
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
          )}
        </DialogContent>
        <DialogActions>
          {resetTo === undefined ? null : (
            <Button
              onClick={() => {
                setDirectories(resetTo());
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
      {picking && renderPicker !== undefined
        ? renderPicker({
            onClose: () => {
              setPicking(false);
            },
            onSelect: directory => {
              setDirectories(current => (current.includes(directory) ? current : [...current, directory]));
            },
          })
        : null}
    </>
  );
};
