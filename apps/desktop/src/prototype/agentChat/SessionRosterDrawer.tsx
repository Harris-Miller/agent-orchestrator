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
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListSubheader from '@mui/material/ListSubheader';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { open as openDirectoryDialog } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import type { FC } from 'react';

import {
  activateSessionFn,
  backendStateAtom,
  createSessionFn,
  deactivateSessionFn,
  deleteSessionFn,
  refreshSessionRosterFn,
  selectSessionFn,
} from './acpBackendAtoms.ts';
import type { NormalizedSessionInfo, SessionSnapshot } from './acpSessionBootstrap.ts';
import type { AcpAgentBackend } from './agentHarness.ts';

export const SESSION_ROSTER_DRAWER_WIDTH = 320;

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

const groupSessionsByCwd = (
  roster: readonly NormalizedSessionInfo[],
): readonly { cwd: string; sessions: readonly NormalizedSessionInfo[] }[] => {
  const groups = new Map<string, NormalizedSessionInfo[]>();
  for (const entry of roster) {
    const existing = groups.get(entry.cwd);
    if (existing === undefined) {
      groups.set(entry.cwd, [entry]);
    } else {
      existing.push(entry);
    }
  }
  return [...groups.entries()].map(([cwd, sessions]) => ({ cwd, sessions }));
};

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
  readonly backend: AcpAgentBackend;
  readonly entry: NormalizedSessionInfo;
  readonly onDeleteRequest: (sessionId: string) => void;
  readonly selected: boolean;
  readonly status: SessionSnapshot['status'];
}> = ({ backend, entry, onDeleteRequest, selected, status }) => {
  const selectSession = useAtomSet(selectSessionFn, { mode: 'promise' });
  const activateSession = useAtomSet(activateSessionFn, { mode: 'promise' });
  const deactivateSession = useAtomSet(deactivateSessionFn, { mode: 'promise' });

  const isActivating = status === 'activating';
  const displayTitle = entry.title ?? truncateSessionId(entry.sessionId);

  return (
    <ListItem disablePadding sx={{ px: 1, py: 0.75 }}>
      <Paper elevation={0} sx={sessionCardSx(selected)}>
        <ListItemButton
          onClick={() => {
            selectSession({ backend, sessionId: entry.sessionId }).catch(() => undefined);
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
          {entry.title !== undefined ? (
            <Typography color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }} variant="caption">
              {truncateSessionId(entry.sessionId)}
            </Typography>
          ) : null}
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
                  activateSession({ backend, sessionId: entry.sessionId }).catch(() => undefined);
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
                  deactivateSession({ backend, sessionId: entry.sessionId }).catch(() => undefined);
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
                  onDeleteRequest(entry.sessionId);
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

export const SessionRosterDrawer: FC<{
  readonly backend: AcpAgentBackend;
  readonly onClose: () => void;
  readonly open: boolean;
}> = ({ backend, onClose, open }) => {
  const snapshot = useAtomValue(backendStateAtom(backend));
  const createSession = useAtomSet(createSessionFn, { mode: 'promise' });
  const refreshSessionRoster = useAtomSet(refreshSessionRosterFn, { mode: 'promise' });
  const deleteSession = useAtomSet(deleteSessionFn, { mode: 'promise' });
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCwd, setSelectedCwd] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<string | undefined>(undefined);

  const controlsEnabled = snapshot.phase === 'ready';

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setSelectedCwd(undefined);
  };

  return (
    <>
      <Drawer
        anchor="left"
        open={open}
        sx={{
          '& .MuiDrawer-paper': {
            borderColor: 'divider',
            borderRight: 1,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            width: SESSION_ROSTER_DRAWER_WIDTH,
          },
          flexShrink: 0,
          width: SESSION_ROSTER_DRAWER_WIDTH,
        }}
        variant="persistent"
      >
        <Box
          sx={{
            alignItems: 'center',
            display: 'flex',
            flexShrink: 0,
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
          }}
        >
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Typography variant="h6">Sessions</Typography>
            <IconButton
              aria-label="Reload sessions"
              disabled={!controlsEnabled}
              onClick={() => {
                refreshSessionRoster(backend).catch(() => undefined);
              }}
              size="small"
            >
              <Typography component="span" sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
                ↻
              </Typography>
            </IconButton>
          </Stack>
          <IconButton aria-label="Close session roster drawer" edge="end" onClick={onClose} size="small">
            <Typography component="span" sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
              ‹
            </Typography>
          </IconButton>
        </Box>
        <Divider />
        <Box sx={{ flexShrink: 0, p: 2 }}>
          <Button
            disabled={!controlsEnabled}
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
          {snapshot.sessionRoster.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }} variant="body2">
              No sessions yet. Create one to get started.
            </Typography>
          ) : (
            <List disablePadding sx={{ py: 0.5 }}>
              {groupSessionsByCwd(snapshot.sessionRoster).map(({ cwd, sessions }) => (
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
                        backend={backend}
                        entry={entry}
                        key={entry.sessionId}
                        onDeleteRequest={setDeleteTarget}
                        selected={snapshot.selectedSessionId === entry.sessionId}
                        status={rosterEntryStatus(entry.sessionId, snapshot.sessions)}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </List>
          )}
        </Box>
      </Drawer>

      <Dialog
        onClose={(_event, reason) => {
          if (reason === 'backdropClick') {
            return;
          }
          closeCreateDialog();
        }}
        open={createOpen}
      >
        <DialogTitle>Create New Session</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
            <Typography
              color={selectedCwd === undefined ? 'text.secondary' : 'text.primary'}
              sx={{ flex: 1, fontFamily: 'monospace', minWidth: 0, overflowWrap: 'anywhere' }}
              variant="body2"
            >
              {selectedCwd ?? 'None'}
            </Typography>
            <Button
              onClick={() => {
                openDirectoryDialog({ directory: true, multiple: false })
                  .then(selected => {
                    if (typeof selected === 'string') {
                      setSelectedCwd(selected);
                    }
                  })
                  .catch(() => undefined);
              }}
              size="small"
              variant="outlined"
            >
              Select directory
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateDialog}>Cancel</Button>
          <Button
            disabled={selectedCwd === undefined}
            onClick={() => {
              if (selectedCwd === undefined) {
                return;
              }

              const cwd = selectedCwd;
              createSession({ backend, cwd })
                .then(() => {
                  closeCreateDialog();
                })
                .catch(() => undefined);
            }}
            variant="contained"
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

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
              {deleteTarget !== undefined ? truncateSessionId(deleteTarget) : ''}
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

              const sessionId = deleteTarget;
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
