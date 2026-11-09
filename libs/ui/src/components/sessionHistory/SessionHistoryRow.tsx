import { isSessionHistoryEntryAvailable } from './isSessionHistoryEntryAvailable.ts';
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Archive } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

import { backendHarnessSnapshotAtom } from '../../atoms/backendState.atoms.ts';
import { activateSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { isArchivedEntry } from '../../host/airMeta.ts';
import { HighlightFzfChars } from '../HighlightFzfChars.tsx';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { noopClientError } from './noopClientError.ts';
import { SessionActionsMenu } from './SessionActionsMenu.tsx';
import { SessionTitleInlineRename } from './SessionTitleInlineRename.tsx';
import { useSessionTitleRename } from './useSessionTitleRename.ts';

const sessionCardSx = (selected: boolean, archived: boolean) =>
  ({
    border: 1,
    borderStyle: archived ? 'dashed' : 'solid',
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
  readonly onInteractionChange?: (active: boolean) => void;
  readonly entry: UnifiedHistoryEntry;
  readonly onClientError?: (error: unknown) => void;
  readonly onDeleteRequest: (entry: UnifiedHistoryEntry) => void;
  readonly selected: boolean;
  readonly positions?: ReadonlySet<number>;
  readonly highlighted?: boolean;
  readonly onActivate?: () => void;
}> = ({
  caption,
  onInteractionChange,
  entry,
  onClientError = noopClientError,
  onDeleteRequest,
  selected,
  positions,
  highlighted,
  onActivate,
}) => {
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const snapshot = useAtomValue(backendHarnessSnapshotAtom(entry.launchTarget));
  const rename = useSessionTitleRename(entry.sessionId);
  const interacting = focused || menuOpen || rename.titleProps.editing;
  const onInteractionChangeRef = useRef(onInteractionChange);
  useEffect(() => {
    onInteractionChangeRef.current = onInteractionChange;
  });
  useEffect(() => {
    if (!interacting) return undefined;
    onInteractionChangeRef.current?.(true);
    return () => onInteractionChangeRef.current?.(false);
  }, [interacting]);
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });

  const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
  const pendingClientRequest = session?.pendingClientRequest !== undefined;
  const displayTitle = entry.title ?? 'New Session';
  const unavailable = !isSessionHistoryEntryAvailable(entry, snapshot.phase);
  const archived = isArchivedEntry(entry);

  const activateHistoryEntry = () => {
    if (unavailable) return;
    onActivate?.();
    // activateSession selects + no-ops when already active/activating (Codex-safe); unarchives an archived entry first.
    activateSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(onClientError);
  };

  return (
    <ListItem
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      disablePadding
      sx={{ px: 1, py: 0.75 }}
    >
      <Paper
        elevation={0}
        aria-disabled={unavailable}
        aria-label={positions === undefined ? undefined : displayTitle}
        onClick={activateHistoryEntry}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activateHistoryEntry();
          }
        }}
        role="button"
        sx={{
          ...sessionCardSx(selected, archived),
          ...(highlighted ? { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '-2px' } : {}),
          ...(unavailable ? { cursor: 'default', opacity: 0.55 } : {}),
        }}
        tabIndex={0}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, px: 1.5, py: 1.25 }}>
          <Box sx={{ display: 'inline-flex', opacity: archived ? 0.5 : 1 }}>
            <AgentLaunchTargetIcon launchTarget={entry.launchTarget} />
          </Box>
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <SessionTitleInlineRename {...rename.titleProps} entry={entry} onClientError={onClientError}>
              <Typography
                color={archived ? 'text.secondary' : undefined}
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
                {positions === undefined ? (
                  displayTitle
                ) : (
                  <HighlightFzfChars text={displayTitle} positions={positions} />
                )}
              </Typography>
            </SessionTitleInlineRename>
            {caption === undefined ? null : (
              <Typography color="text.secondary" noWrap variant="caption">
                {caption}
              </Typography>
            )}
          </Stack>
          {archived ? (
            <LucideMuiIcon icon={Archive} titleAccess="Archived" sx={{ color: 'text.disabled', fontSize: '0.9rem' }} />
          ) : null}
          {pendingClientRequest ? (
            <CircularProgress aria-label="Pending client request" size={14} sx={{ flexShrink: 0 }} />
          ) : null}
          <SessionActionsMenu
            onInteractionChange={setMenuOpen}
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
