import { useAtomSet, useAtomValue } from '@effect/atom-react';
import CircularProgress from '@mui/material/CircularProgress';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { backendHarnessSnapshotAtom } from '../../atoms/backendState.atoms.ts';
import { activateSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { isUsablePhase } from '../../host/acpSessionBootstrap.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';

import { noopClientError } from './noopClientError.ts';
import { SessionActionsMenu } from './SessionActionsMenu.tsx';
import { SessionTitleInlineRename } from './SessionTitleInlineRename.tsx';
import { useSessionTitleRename } from './useSessionTitleRename.ts';

const sessionCardSx = (selected: boolean) =>
  ({
    border: 1,
    borderColor: selected ? 'primary.main' : 'divider',
    borderRadius: 1,
    cursor: 'pointer',
    overflow: 'hidden',
    width: '100%',
    ...(selected ? { bgcolor: 'action.selected' } : { bgcolor: 'background.paper' }),
    '&:hover': {
      bgcolor: 'action.hover',
    },
  }) as const;

export const SessionHistoryRow: FC<{
  /** Secondary line under the title (Pinned region shows the session's folder). */
  readonly caption?: string;
  readonly entry: UnifiedHistoryEntry;
  readonly onClientError?: (error: unknown) => void;
  readonly onDeleteRequest: (entry: UnifiedHistoryEntry) => void;
  readonly selected: boolean;
}> = ({ caption, entry, onClientError = noopClientError, onDeleteRequest, selected }) => {
  const snapshot = useAtomValue(backendHarnessSnapshotAtom(entry.launchTarget));
  const rename = useSessionTitleRename(entry.sessionId);
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });

  const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
  const pendingClientRequest = session?.pendingClientRequest !== undefined;
  const displayTitle = entry.title ?? 'New Session';
  const unavailable = entry.unavailable === true || !isUsablePhase(snapshot.phase);

  const activateHistoryEntry = () => {
    if (unavailable) return;
    // activateSession selects + no-ops when already active/activating (Codex-safe).
    activateSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(onClientError);
  };

  return (
    <ListItem disablePadding sx={{ px: 1, py: 0.75 }}>
      <Paper
        elevation={0}
        aria-disabled={unavailable}
        onClick={activateHistoryEntry}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activateHistoryEntry();
          }
        }}
        role="button"
        sx={{ ...sessionCardSx(selected), ...(unavailable ? { cursor: 'default', opacity: 0.55 } : {}) }}
        tabIndex={0}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, px: 1.5, py: 1.25 }}>
          <AgentLaunchTargetIcon launchTarget={entry.launchTarget} />
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <SessionTitleInlineRename {...rename.titleProps} entry={entry} onClientError={onClientError}>
              <Typography
                sx={{
                  display: '-webkit-box',
                  fontWeight: selected ? 600 : 400,
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                  width: '100%',
                }}
                variant="body2"
              >
                {displayTitle}
              </Typography>
            </SessionTitleInlineRename>
            {caption === undefined ? null : (
              <Typography color="text.secondary" noWrap variant="caption">
                {caption}
              </Typography>
            )}
          </Stack>
          {pendingClientRequest ? (
            <CircularProgress aria-label="Pending client request" size={14} sx={{ flexShrink: 0 }} />
          ) : null}
          <SessionActionsMenu
            entry={entry}
            onClientError={onClientError}
            onDeleteRequest={onDeleteRequest}
            onRenameRequest={rename.onRenameRequest}
            sx={{ mr: -0.5 }}
          />
        </Stack>
      </Paper>
    </ListItem>
  );
};
