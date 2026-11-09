import Box from '@mui/material/Box';
import { Archive, ArchiveRestore, Pencil, Trash2, X } from 'lucide-react';
import type { FC } from 'react';

import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { IconTooltipButton } from '../IconTooltipButton.tsx';
import { SessionActionsMenu } from '../sessionHistory/SessionActionsMenu.tsx';
import { useSessionActions } from '../sessionHistory/useSessionActions.ts';

import { useParentNarrow } from './useParentNarrow.ts';

/** Header row width (px) below which the icon buttons collapse back into the dotdotdot menu. */
const NARROW_HEADER_PX = 520;

/**
 * Session actions as header buttons: Rename right beside the title, then a spacer, then the rest at the far end (Pin lives only in the History menu).
 * Same actions and rules as `SessionActionsMenu` (they share `useSessionActions`). Below `NARROW_HEADER_PX` the
 * buttons (Rename included) collapse into that menu. Renders a fragment.
 */
export const SessionHeaderActions: FC<{
  readonly editing: boolean;
  readonly entry: UnifiedHistoryEntry;
  readonly onBeforeAction?: () => void;
  readonly onClientError: (error: unknown) => void;
  readonly onDeleteRequest: (entry: UnifiedHistoryEntry) => void;
  readonly onRenameRequest: () => void;
}> = ({ editing, entry, onBeforeAction, onClientError, onDeleteRequest, onRenameRequest }) => {
  const actions = useSessionActions({ canRename: true, entry, onBeforeAction, onClientError });
  const { narrow, probeRef } = useParentNarrow(NARROW_HEADER_PX);

  return (
    <>
      {/* Out of flow (no gap, no size): only here so the hook can measure the host row. */}
      <Box aria-hidden ref={probeRef} sx={{ height: 0, position: 'absolute', width: 0 }} />
      {narrow || actions.rename === undefined ? null : (
        <IconTooltipButton disabled={actions.rename.disabled} icon={Pencil} label="Rename" onClick={onRenameRequest} />
      )}
      {/* While the title is being edited it already takes the slack; a second grower would halve the input. */}
      {editing ? null : <Box sx={{ flex: 1, minWidth: 0 }} />}
      {narrow ? (
        <SessionActionsMenu
          entry={entry}
          onBeforeAction={onBeforeAction}
          onClientError={onClientError}
          onDeleteRequest={onDeleteRequest}
          onRenameRequest={onRenameRequest}
        />
      ) : (
        <>
          {actions.unarchive === undefined ? null : (
            <IconTooltipButton
              disabled={actions.unarchive.disabled}
              icon={ArchiveRestore}
              label="Unarchive"
              onClick={actions.runUnarchive}
            />
          )}
          {actions.deactivate === undefined ? null : (
            <IconTooltipButton
              disabled={actions.deactivate.disabled}
              icon={X}
              label="Close"
              onClick={actions.runDeactivate}
            />
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
      )}
    </>
  );
};
