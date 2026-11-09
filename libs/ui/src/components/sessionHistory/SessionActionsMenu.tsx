import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
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
  readonly onBeforeAction?: () => void;
  readonly onInteractionChange?: (active: boolean) => void;
  readonly onClientError?: (error: unknown) => void;
  readonly onDeleteRequest: (entry: UnifiedHistoryEntry) => void;
  readonly onRenameRequest?: () => void;
  readonly sx?: { readonly mr?: number };
}> = ({
  onBeforeAction,
  onInteractionChange,
  entry,
  onClientError = noopClientError,
  onDeleteRequest,
  onRenameRequest,
  sx,
}) => {
  const actions = useSessionActions({ canRename: onRenameRequest !== undefined, entry, onBeforeAction, onClientError });
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

      <Menu
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
        {actions.unarchive === undefined ? null : (
          <MenuItem
            disabled={actions.unarchive.disabled}
            onClick={() => {
              closeMenu();
              actions.runUnarchive();
            }}
          >
            <ListItemIcon>
              <LucideMuiIcon fontSize="small" icon={ArchiveRestore} />
            </ListItemIcon>
            <ListItemText>Unarchive</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          disabled={actions.pin.disabled}
          onClick={() => {
            closeMenu();
            actions.runPin();
          }}
        >
          <ListItemIcon>
            <LucideMuiIcon fontSize="small" icon={actions.pinned ? PinOff : Pin} />
          </ListItemIcon>
          <ListItemText>{actions.pinned ? 'Unpin' : 'Pin'}</ListItemText>
        </MenuItem>
        {actions.deactivate === undefined ? null : (
          <MenuItem
            disabled={actions.deactivate.disabled}
            onClick={() => {
              closeMenu();
              actions.runDeactivate();
            }}
          >
            <ListItemIcon>
              <LucideMuiIcon fontSize="small" icon={X} />
            </ListItemIcon>
            <ListItemText>Close</ListItemText>
          </MenuItem>
        )}
        {actions.rename === undefined ? null : (
          <MenuItem
            disabled={actions.rename.disabled}
            onClick={() => {
              renameRequested.current = true;
              closeMenu();
            }}
          >
            <ListItemIcon>
              <LucideMuiIcon fontSize="small" icon={Pencil} />
            </ListItemIcon>
            <ListItemText>Rename</ListItemText>
          </MenuItem>
        )}
        {actions.archive === undefined ? null : (
          <MenuItem
            disabled={actions.archive.disabled}
            onClick={() => {
              closeMenu();
              actions.runArchive();
            }}
          >
            <ListItemIcon>
              <LucideMuiIcon fontSize="small" icon={Archive} />
            </ListItemIcon>
            <ListItemText>Archive</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          disabled={actions.delete.disabled}
          onClick={() => {
            closeMenu();
            onDeleteRequest(entry);
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            <LucideMuiIcon fontSize="small" icon={Trash2} />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};
