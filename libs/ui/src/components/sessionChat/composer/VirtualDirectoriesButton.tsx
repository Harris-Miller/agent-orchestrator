import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { X } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { patchVirtualSessionAtomFn } from '../../../atoms/boundHarnessAtoms.ts';
import { virtualMaterializingAtom, virtualSessionAtom } from '../../../atoms/virtualSession.atoms.ts';
import { workspaceDirectoriesAtom } from '../../../atoms/workspaceFolderPaths.atoms.ts';
import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';

/**
 * Where a host has no directory picker (VS Code): the Virtual session's Additional directories, removable for this
 * session only (more come from the Workspace folders). Reset goes back to what the Workspace and its Project's defaults give.
 */
export const VirtualDirectoriesButton: FC<{ readonly onClientError: (error: unknown) => void }> = ({
  onClientError,
}) => {
  const virtual = useAtomValue(virtualSessionAtom);
  const inFlight = useAtomValue(virtualMaterializingAtom);
  const workspace = useAtomValue(workspaceDirectoriesAtom);
  const patchVirtual = useAtomSet(patchVirtualSessionAtomFn, { mode: 'promise' });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<readonly string[]>([]);
  const count = virtual?.additionalDirectories?.length ?? 0;
  const workspaceCount = workspace.additionalDirectories?.length ?? 0;
  if (virtual === null || inFlight || (count === 0 && workspaceCount === 0)) {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => {
          setDraft(virtual.additionalDirectories ?? []);
          setOpen(true);
        }}
        size="small"
        sx={{ color: 'text.secondary', fontSize: 12, minWidth: 0, ml: 1, p: 0, textTransform: 'none' }}
      >
        {count === 0 ? '+ directories' : `+${String(count)} directories`}
      </Button>
      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={() => {
          setOpen(false);
        }}
        open={open}
      >
        <DialogTitle>Additional directories</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>
            For this session only. Other folders come from the Workspace folders and the Project&apos;s defaults.
          </DialogContentText>
          {draft.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              None
            </Typography>
          ) : (
            draft.map(directory => (
              <Box key={directory} sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                <Typography noWrap sx={{ flex: 1, minWidth: 0 }} title={directory} variant="body2">
                  {directory}
                </Typography>
                <IconButton
                  aria-label={`Remove ${directory}`}
                  onClick={() => {
                    setDraft(current => current.filter(item => item !== directory));
                  }}
                  size="small"
                >
                  <LucideMuiIcon fontSize="small" icon={X} />
                </IconButton>
              </Box>
            ))
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDraft(workspace.additionalDirectories ?? []);
            }}
            sx={{ mr: 'auto' }}
          >
            Reset to Project defaults
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              patchVirtual({ additionalDirectories: [...draft] }).catch(onClientError);
            }}
            variant="contained"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
