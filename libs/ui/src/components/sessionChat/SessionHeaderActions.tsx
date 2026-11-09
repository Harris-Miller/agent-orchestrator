import Box from '@mui/material/Box';
import { Archive, ArchiveRestore, Pencil, Pin, PinOff, Trash2, X } from 'lucide-react';
import type { FC } from 'react';

import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { IconTooltipButton } from '../IconTooltipButton.tsx';
import { useSessionActions } from '../sessionHistory/useSessionActions.ts';

/**
 * Session actions as header buttons: Pin/Unpin right beside the title, then a spacer, then the rest at the far end.
 * Same actions and rules as `SessionActionsMenu` (they share `useSessionActions`). Renders a fragment.
 */
export const SessionHeaderActions: FC<{
  readonly entry: UnifiedHistoryEntry;
  readonly onBeforeAction?: () => void;
  readonly onClientError: (error: unknown) => void;
  readonly onDeleteRequest: (entry: UnifiedHistoryEntry) => void;
  readonly onRenameRequest: () => void;
}> = ({ entry, onBeforeAction, onClientError, onDeleteRequest, onRenameRequest }) => {
  const actions = useSessionActions({ canRename: true, entry, onBeforeAction, onClientError });

  return (
    <>
      <IconTooltipButton
        disabled={actions.pin.disabled}
        icon={actions.pinned ? PinOff : Pin}
        label={actions.pinned ? 'Unpin' : 'Pin'}
        onClick={actions.runPin}
      />
      <Box sx={{ flex: 1, minWidth: 0 }} />
      {actions.unarchive === undefined ? null : (
        <IconTooltipButton
          disabled={actions.unarchive.disabled}
          icon={ArchiveRestore}
          label="Unarchive"
          onClick={actions.runUnarchive}
        />
      )}
      {actions.close === undefined ? null : (
        <IconTooltipButton disabled={actions.close.disabled} icon={X} label="Close" onClick={actions.runClose} />
      )}
      {actions.rename === undefined ? null : (
        <IconTooltipButton disabled={actions.rename.disabled} icon={Pencil} label="Rename" onClick={onRenameRequest} />
      )}
      {actions.archive === undefined ? null : (
        <IconTooltipButton
          disabled={actions.archive.disabled}
          icon={Archive}
          label="Archive"
          onClick={actions.runArchive}
        />
      )}
      <IconTooltipButton
        color="error"
        disabled={actions.delete.disabled}
        icon={Trash2}
        label="Delete"
        onClick={() => {
          onDeleteRequest(entry);
        }}
      />
    </>
  );
};
