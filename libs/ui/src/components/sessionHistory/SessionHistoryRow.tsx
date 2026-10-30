import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Archive, Ellipsis, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { backendHarnessStateAtom } from '../../atoms/backendState.atoms.ts';
import { activateSessionAtomFn, archiveSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { hasSessionArchiveCapability } from '../../host/acpSessionBootstrap.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { noopClientError } from './noopClientError.ts';

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
  readonly entry: UnifiedHistoryEntry;
  readonly onClientError?: (error: unknown) => void;
  readonly onDeleteRequest: (entry: UnifiedHistoryEntry) => void;
  readonly selected: boolean;
}> = ({ entry, onClientError = noopClientError, onDeleteRequest, selected }) => {
  const snapshot = useAtomValue(backendHarnessStateAtom(entry.launchTarget));
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const archiveSession = useAtomSet(archiveSessionAtomFn, { mode: 'promise' });
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);

  const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
  const pendingClientRequest = session?.pendingClientRequest !== undefined;
  const displayTitle = entry.title ?? 'New Session';
  const menuOpen = menuAnchor !== null;
  const unavailable = entry.unavailable === true || snapshot.phase !== 'ready';

  const activateHistoryEntry = () => {
    if (unavailable) return;
    // activateSession selects + no-ops when already active/activating (Codex-safe).
    activateSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(onClientError);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
  };

  return (
    <ListItem disablePadding sx={{ px: 1, py: 0.75 }}>
      <Paper
        elevation={0}
        aria-disabled={unavailable}
        onClick={activateHistoryEntry}
        onKeyDown={event => {
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
          <Box sx={{ flex: 1, minWidth: 0 }}>
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
          </Box>
          {pendingClientRequest ? (
            <CircularProgress aria-label="Pending client request" size={14} sx={{ flexShrink: 0 }} />
          ) : null}
          <IconButton
            aria-label="Session actions"
            onClick={event => {
              event.stopPropagation();
              setMenuAnchor(event.currentTarget);
            }}
            size="small"
            sx={{ flexShrink: 0, mr: -0.5 }}
          >
            <LucideMuiIcon fontSize="small" icon={Ellipsis} />
          </IconButton>
        </Stack>
      </Paper>

      <Popover
        anchorEl={menuAnchor}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        onClose={closeMenu}
        open={menuOpen}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <Stack spacing={1} sx={{ p: 1 }}>
          {hasSessionArchiveCapability(snapshot.initializeResult) ? (
            <Button
              disabled={unavailable}
              onClick={() => {
                closeMenu();
                archiveSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(onClientError);
              }}
              size="small"
              startIcon={<LucideMuiIcon icon={Archive} />}
              variant="outlined"
            >
              Archive
            </Button>
          ) : null}
          <Button
            color="error"
            disabled={unavailable}
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
    </ListItem>
  );
};
