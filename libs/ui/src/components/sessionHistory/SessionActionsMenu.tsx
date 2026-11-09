import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { Archive, ArchiveRestore, Ellipsis, Pencil, Pin, PinOff, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { FC, SyntheticEvent } from 'react';

import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { noopClientError } from './noopClientError.ts';
import { useSessionActions } from './useSessionActions.ts';

// React events bubble through portals: keep menu clicks/keys from reaching an enclosing activate handler.
const stopPropagation = (event: SyntheticEvent) => {
  event.stopPropagation();
};

/** On an archived entry: Unarchive (then opens it), Pin/Unpin and Delete only (Codex rejects renaming archived sessions). */
export const SessionActionsMenu: FC<{
  readonly entry: UnifiedHistoryEntry;
  readonly onInteractionChange?: (active: boolean) => void;
  readonly onClientError?: (error: unknown) => void;
  readonly onDeleteRequest: (entry: UnifiedHistoryEntry) => void;
  readonly onRenameRequest?: () => void;
  readonly sx?: { readonly mr?: number };
}> = ({ onInteractionChange, entry, onClientError = noopClientError, onDeleteRequest, onRenameRequest, sx }) => {
  const actions = useSessionActions({ canRename: onRenameRequest !== undefined, entry, onClientError });
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);

  // MUI returns focus to the trigger when the Popover closes; start editing only after that, or the input blur-commits.
  const renameRequested = useRef(false);

  const closeMenu = () => {
    setMenuAnchor(null);
  };

  return (
    <>
      <IconButton
        aria-label="Session actions"
        onClick={event => {
          event.stopPropagation();
          setMenuAnchor(event.currentTarget);
          onInteractionChange?.(true);
        }}
        onKeyDown={stopPropagation}
        size="small"
        sx={{ flexShrink: 0, ...sx }}
      >
        <LucideMuiIcon fontSize="small" icon={Ellipsis} />
      </IconButton>

      <Popover
        anchorEl={menuAnchor}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        onClick={stopPropagation}
        onClose={closeMenu}
        onKeyDown={stopPropagation}
        open={menuAnchor !== null}
        slotProps={{
          transition: {
            onExited: () => {
              if (renameRequested.current) {
                renameRequested.current = false;
                onRenameRequest?.();
              }
              onInteractionChange?.(false);
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <Stack spacing={1} sx={{ p: 1 }}>
          {actions.unarchive === undefined ? null : (
            <Button
              disabled={actions.unarchive.disabled}
              onClick={() => {
                closeMenu();
                actions.runUnarchive();
              }}
              size="small"
              startIcon={<LucideMuiIcon icon={ArchiveRestore} />}
              variant="outlined"
            >
              Unarchive
            </Button>
          )}
          <Button
            disabled={actions.pin.disabled}
            onClick={() => {
              closeMenu();
              actions.runPin();
            }}
            size="small"
            startIcon={<LucideMuiIcon icon={actions.pinned ? PinOff : Pin} />}
            variant="outlined"
          >
            {actions.pinned ? 'Unpin' : 'Pin'}
          </Button>
          {actions.close === undefined ? null : (
            <Button
              disabled={actions.close.disabled}
              onClick={() => {
                closeMenu();
                actions.runClose();
              }}
              size="small"
              startIcon={<LucideMuiIcon icon={X} />}
              variant="outlined"
            >
              Close
            </Button>
          )}
          {actions.rename === undefined ? null : (
            <Button
              disabled={actions.rename.disabled}
              onClick={() => {
                renameRequested.current = true;
                closeMenu();
              }}
              size="small"
              startIcon={<LucideMuiIcon icon={Pencil} />}
              variant="outlined"
            >
              Rename
            </Button>
          )}
          {actions.archive === undefined ? null : (
            <Button
              disabled={actions.archive.disabled}
              onClick={() => {
                closeMenu();
                actions.runArchive();
              }}
              size="small"
              startIcon={<LucideMuiIcon icon={Archive} />}
              variant="outlined"
            >
              Archive
            </Button>
          )}
          <Button
            color="error"
            disabled={actions.delete.disabled}
            onClick={() => {
              closeMenu();
              onDeleteRequest(entry);
            }}
            size="small"
            startIcon={<LucideMuiIcon icon={Trash2} />}
            variant="outlined"
          >
            Delete
          </Button>
        </Stack>
      </Popover>
    </>
  );
};
