import { isSessionHistoryEntryAvailable } from './isSessionHistoryEntryAvailable.ts';
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
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
import { hasBackgroundActivity } from '../../host/subagent.ts';
import { HighlightFzfChars } from '../HighlightFzfChars.tsx';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { noopClientError } from './noopClientError.ts';
import { SessionActionsMenu } from './SessionActionsMenu.tsx';
import { DEFAULT_SESSION_TITLE } from './sessionRowMeta.ts';
import { SessionTitleInlineRename } from './SessionTitleInlineRename.tsx';
import { useSessionTitleRename } from './useSessionTitleRename.ts';

const sessionCardSx = (selected: boolean, actionsPinned: boolean) =>
  ({
    borderLeft: 2,
    borderLeftStyle: 'solid',
    borderLeftColor: selected ? 'primary.main' : 'transparent',
    borderRadius: 0,
    cursor: 'pointer',
    overflow: 'hidden',
    width: '100%',
    bgcolor: selected ? 'action.selected' : 'transparent',
    '& .row-actions': { opacity: actionsPinned ? 1 : 0 },
    '&:hover': {
      bgcolor: selected ? 'action.selected' : 'action.hover',
    },
    '&:hover .row-actions, &:focus-within .row-actions': { opacity: 1 },
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
  /** Bulk select mode: a checkbox replaces activation and the Session actions menu. */
  readonly selection?: { readonly checked: boolean; readonly onToggle: () => void };
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
  selection,
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
  const pendingClientRequest =
    session?.pendingClientRequest !== undefined || hasBackgroundActivity(snapshot, entry.sessionId);
  const displayTitle = entry.title ?? DEFAULT_SESSION_TITLE;
  const unavailable = !isSessionHistoryEntryAvailable(entry, snapshot.phase);
  const archived = entry.archived === true;

  const activateHistoryEntry = () => {
    if (unavailable) return;
    if (selection !== undefined) {
      selection.onToggle();
      return;
    }
    onActivate?.();
    // activateSession selects + no-ops when already active/activating (Codex-safe); unarchives an archived entry first.
    activateSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(onClientError);
  };

  return (
    <ListItem
      onFocusCapture={() => {
        setFocused(true);
      }}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      disablePadding
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
          ...sessionCardSx(selected, menuOpen),
          ...(highlighted === true
            ? { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '-2px' }
            : {}),
          ...(unavailable ? { cursor: 'default', opacity: 0.55 } : {}),
        }}
        tabIndex={0}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, pl: 1, pr: 3.375, py: 0.5 }}>
          {selection === undefined ? null : (
            <Checkbox
              checked={selection.checked}
              disabled={unavailable}
              onChange={selection.onToggle}
              onClick={event => {
                event.stopPropagation();
              }}
              size="small"
              slotProps={{ input: { 'aria-label': `Select ${displayTitle}` } }}
              sx={{ ml: -0.75, p: 0.5 }}
            />
          )}
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
          {selection === undefined ? (
            <SessionActionsMenu
              className="row-actions"
              onInteractionChange={setMenuOpen}
              entry={entry}
              onClientError={onClientError}
              onDeleteRequest={onDeleteRequest}
              onRenameRequest={rename.onRenameRequest}
              sx={{ mr: -0.5 }}
            />
          ) : null}
        </Stack>
      </Paper>
    </ListItem>
  );
};
