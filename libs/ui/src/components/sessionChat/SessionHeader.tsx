import { useAtomValue } from '@effect/atom-react';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { TypographyProps } from '@mui/material/Typography';
import type { FC } from 'react';

import { sessionHeaderAtom } from '../../atoms/sessionHeader.atoms.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { ConfirmSessionDeleteDialog } from '../sessionHistory/ConfirmSessionDeleteDialog.tsx';
import { SessionActionsMenu } from '../sessionHistory/SessionActionsMenu.tsx';
import { SessionTitleInlineRename } from '../sessionHistory/SessionTitleInlineRename.tsx';
import { useSessionDeleteRequest } from '../sessionHistory/useSessionDeleteRequest.ts';
import { useSessionTitleRename } from '../sessionHistory/useSessionTitleRename.ts';

/**
 * Session header for whatever is Selected: launch target icon, Session title (inline rename when it has a History
 * entry) and Session actions, hidden while Virtual or while a Subagent view is shown. Renders a fragment: place it in
 * the host's horizontal flex row, between the host's own controls.
 */
export const SessionHeader: FC<{
  /**
   * Runs right before Close, Archive or Delete of the Selected session (never Pin or Rename). Those clear Selected;
   * a host where unset Selected unmounts Chat (VS Code) passes a switch to the Virtual session here.
   */
  readonly onBeforeAction?: () => void;
  readonly onClientError: (error: unknown) => void;
  /** Title text styling only (host typography convention). */
  readonly titleProps: {
    readonly sx?: Exclude<SxProps<Theme>, readonly unknown[]>;
    readonly variant?: TypographyProps['variant'];
  };
}> = ({ onBeforeAction, onClientError, titleProps }) => {
  const { entry, launchTarget, showActions, title } = useAtomValue(sessionHeaderAtom);
  const rename = useSessionTitleRename(entry?.sessionId);
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError, onBeforeAction);

  return (
    <>
      {launchTarget === undefined ? null : <AgentLaunchTargetIcon launchTarget={launchTarget} />}
      {entry === undefined ? (
        <Typography noWrap sx={[{ flex: 1, minWidth: 0 }, titleProps.sx ?? false]} variant={titleProps.variant}>
          {title}
        </Typography>
      ) : (
        <SessionTitleInlineRename {...rename.titleProps} entry={entry} onClientError={onClientError}>
          <Typography noWrap sx={titleProps.sx} variant={titleProps.variant}>
            {title}
          </Typography>
        </SessionTitleInlineRename>
      )}
      {entry !== undefined && showActions ? (
        <SessionActionsMenu
          entry={entry}
          onBeforeAction={onBeforeAction}
          onClientError={onClientError}
          onDeleteRequest={requestDelete}
          onRenameRequest={rename.onRenameRequest}
        />
      ) : null}
      {/* Outside the entry branch: Delete clears Selected (so `entry`) before the dialog closes itself. */}
      <ConfirmSessionDeleteDialog
        onBeforeDelete={onBeforeAction}
        onCancel={clearDeleteTarget}
        onClientError={onClientError}
        target={deleteTarget}
      />
    </>
  );
};
