import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListSubheader from '@mui/material/ListSubheader';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC } from 'react';

import {
  activateSessionFn,
  allBackendPhasesAtom,
  backendStateAtom,
  deactivateSessionFn,
  deleteSessionFn,
  refreshAllSessionRostersFn,
  selectedSessionIdAtom,
  selectSessionFn,
  unifiedSessionRosterAtom,
} from './acpBackendAtoms.ts';
import { backendLabel, groupAndSortSessionsByCwd } from './acpSessionBootstrap.ts';
import type { SessionSnapshot, UnifiedRosterEntry } from './acpSessionBootstrap.ts';
import { CreateSessionDirectoryPicker } from './CreateSessionDirectoryPicker.tsx';
import { PanelHeader } from './PanelHeader.tsx';

export const SESSION_ROSTER_PANEL_WIDTH = 320;

const truncateSessionId = (sessionId: string): string =>
  sessionId.length > 12 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}` : sessionId;

const statusColor = (status: SessionSnapshot['status']): 'default' | 'success' | 'warning' => {
  switch (status) {
    case 'activating':
      return 'warning';
    case 'active':
      return 'success';
    case 'inactive':
      return 'default';
  }
};

const rosterEntryStatus = (
  sessionId: string,
  sessions: Readonly<Record<string, SessionSnapshot>>,
): SessionSnapshot['status'] => (sessionId in sessions ? sessions[sessionId].status : 'inactive');

const sessionCardSx = (selected: boolean) =>
  ({
    border: 1,
    borderColor: selected ? 'primary.main' : 'divider',
    borderRadius: 1,
    overflow: 'hidden',
    width: '100%',
    ...(selected ? { bgcolor: 'action.selected' } : { bgcolor: 'background.paper' }),
  }) as const;

const SessionRow: FC<{
  readonly entry: UnifiedRosterEntry;
  readonly onDeleteRequest: (entry: UnifiedRosterEntry) => void;
  readonly selected: boolean;
}> = ({ entry, onDeleteRequest, selected }) => {
  const snapshot = useAtomValue(backendStateAtom(entry.backend));
  const selectSession = useAtomSet(selectSessionFn, { mode: 'promise' });
  const activateSession = useAtomSet(activateSessionFn, { mode: 'promise' });
  const deactivateSession = useAtomSet(deactivateSessionFn, { mode: 'promise' });

  const status = rosterEntryStatus(entry.sessionId, snapshot.sessions);
  const isActivating = status === 'activating';
  const displayTitle = entry.title ?? truncateSessionId(entry.sessionId);

  return (
    <ListItem disablePadding sx={{ px: 1, py: 0.75 }}>
      <Paper elevation={0} sx={sessionCardSx(selected)}>
        <ListItemButton
          onClick={() => {
            selectSession({ backend: entry.backend, sessionId: entry.sessionId }).catch(() => undefined);
          }}
          selected={selected}
          sx={{
            alignItems: 'flex-start',
            flexDirection: 'column',
            gap: 0.5,
            py: 1.25,
            width: '100%',
          }}
        >
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
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
            <Chip label={backendLabel(entry.backend)} size="small" variant="outlined" />
            {entry.title !== undefined ? (
              <Typography color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }} variant="caption">
                {truncateSessionId(entry.sessionId)}
              </Typography>
            ) : null}
          </Stack>
        </ListItemButton>
        <Divider />
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.75 }}
        >
          <Chip color={statusColor(status)} label={status} size="small" variant="outlined" />
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
            {status === 'inactive' ? (
              <Button
                onClick={event => {
                  event.stopPropagation();
                  activateSession({ backend: entry.backend, sessionId: entry.sessionId }).catch(() => undefined);
                }}
                size="small"
                variant="outlined"
              >
                Activate
              </Button>
            ) : (
              <Button
                disabled={isActivating}
                onClick={event => {
                  event.stopPropagation();
                  deactivateSession({ backend: entry.backend, sessionId: entry.sessionId }).catch(() => undefined);
                }}
                size="small"
                variant="outlined"
              >
                {isActivating ? 'Activating…' : 'Deactivate'}
              </Button>
            )}
            {status === 'inactive' ? (
              <Button
                color="error"
                onClick={event => {
                  event.stopPropagation();
                  onDeleteRequest(entry);
                }}
                size="small"
                variant="outlined"
              >
                Delete
              </Button>
            ) : null}
          </Stack>
        </Stack>
      </Paper>
    </ListItem>
  );
};

export const SessionRosterPanel: FC<{
  readonly onClose: () => void;
}> = ({ onClose }) => {
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const backendPhases = useAtomValue(allBackendPhasesAtom);
  const refreshAllSessionRosters = useAtomSet(refreshAllSessionRostersFn, { mode: 'promise' });
  const deleteSession = useAtomSet(deleteSessionFn, { mode: 'promise' });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<undefined | UnifiedRosterEntry>(undefined);

  const anyReady = backendPhases.some(entry => entry.phase === 'ready');

  return (
    <>
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderColor: 'divider',
          borderRight: 1,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
        }}
      >
        <PanelHeader
          closeAriaLabel="Close session roster panel"
          closeGlyph="‹"
          onClose={onClose}
          title="Sessions"
          titleEnd={
            <IconButton
              aria-label="Reload sessions"
              disabled={!anyReady}
              onClick={() => {
                refreshAllSessionRosters(undefined).catch(() => undefined);
              }}
              size="small"
            >
              <Typography component="span" sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
                ↻
              </Typography>
            </IconButton>
          }
        />
        <Box sx={{ flexShrink: 0, p: 2 }}>
          <Button
            disabled={!anyReady}
            fullWidth
            onClick={() => {
              setCreateOpen(true);
            }}
            variant="contained"
          >
            Create New Session
          </Button>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {roster.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }} variant="body2">
              No sessions yet. Create one to get started.
            </Typography>
          ) : (
            <List disablePadding sx={{ py: 0.5 }}>
              {groupAndSortSessionsByCwd(roster).map(({ cwd, sessions }) => (
                <li key={cwd}>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    <ListSubheader
                      sx={{
                        bgcolor: 'background.paper',
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        lineHeight: 1.4,
                        overflowWrap: 'anywhere',
                        py: 1,
                        whiteSpace: 'normal',
                      }}
                    >
                      {cwd}
                    </ListSubheader>
                    {sessions.map(entry => (
                      <SessionRow
                        entry={entry}
                        key={`${entry.backend}:${entry.sessionId}`}
                        onDeleteRequest={setDeleteTarget}
                        selected={selectedSessionId === entry.sessionId}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </List>
          )}
        </Box>
      </Box>

      {createOpen ? (
        <CreateSessionDirectoryPicker
          onClose={() => {
            setCreateOpen(false);
          }}
        />
      ) : null}

      <Dialog
        onClose={() => {
          setDeleteTarget(undefined);
        }}
        open={deleteTarget !== undefined}
      >
        <DialogTitle>Delete session?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete session{' '}
            <Typography component="span" sx={{ fontFamily: 'monospace' }}>
              {deleteTarget !== undefined ? truncateSessionId(deleteTarget.sessionId) : ''}
            </Typography>
            . This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteTarget(undefined);
            }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            onClick={() => {
              if (deleteTarget === undefined) {
                return;
              }

              const { backend, sessionId } = deleteTarget;
              deleteSession({ backend, sessionId })
                .then(() => {
                  setDeleteTarget(undefined);
                })
                .catch(() => undefined);
            }}
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
