import { RegistryContext, useAtomSet, useAtomValue } from '@effect/atom-react';
import type { AgentLaunchTarget, UnifiedRosterEntry } from '@lib/ui';
import {
  activateSessionAtomFn,
  agentLaunchTargetLabel,
  allLaunchTargetPhasesAtom,
  backendHarnessStateAtom,
  confirmSessionDeleteAtom,
  createSessionAtomFn,
  deleteSessionAtomFn,
  ProvidersSettingsPane,
  refreshAllSessionRostersAtomFn,
  selectedSessionIdAtom,
  selectSessionAtomFn,
  sessionListScopeAtom,
  unifiedSessionRosterAtom,
} from '@lib/ui';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Delete from '@mui/icons-material/Delete';
import MoreHoriz from '@mui/icons-material/MoreHoriz';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useContext, useState } from 'react';
import type { FC, MouseEvent } from 'react';

import { OnClientErrorContext } from './onClientError.tsx';
import { sessionCwdAtom } from './workspaceFolderPaths.atoms.ts';

const truncateSessionId = (sessionId: string): string =>
  sessionId.length > 12 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}` : sessionId;

const SessionRow: FC<{
  readonly entry: UnifiedRosterEntry;
  readonly onDeleteRequest: (entry: UnifiedRosterEntry) => void;
  readonly selected: boolean;
}> = ({ entry, onDeleteRequest, selected }) => {
  const snapshot = useAtomValue(backendHarnessStateAtom(entry.launchTarget));
  const selectSession = useAtomSet(selectSessionAtomFn, { mode: 'promise' });
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const navigate = useNavigate();
  const onClientError = useContext(OnClientErrorContext);
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);

  const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
  const status = session?.status ?? 'inactive';
  const pendingClientRequest = session?.pendingClientRequest !== undefined;
  const displayTitle = entry.title ?? 'New Session';

  const openSession = () => {
    const go = () => {
      navigate({ params: { sessionId: entry.sessionId }, to: '/session/$sessionId' }).catch(() => undefined);
    };
    if (status !== 'active' && status !== 'activating') {
      activateSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).then(go).catch(onClientError);
      return;
    }
    selectSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).then(go).catch(onClientError);
  };

  return (
    <ListItem
      disablePadding
      secondaryAction={
        <IconButton
          aria-label="Session actions"
          edge="end"
          onClick={event => {
            setMenuAnchor(event.currentTarget);
          }}
          size="small"
        >
          <MoreHoriz fontSize="small" />
        </IconButton>
      }
    >
      <ListItemButton onClick={openSession} selected={selected}>
        <ListItemText
          primary={displayTitle}
          secondary={`${agentLaunchTargetLabel(entry.launchTarget)}${pendingClientRequest ? ' · busy' : ''}`}
        />
        {pendingClientRequest ? (
          <CircularProgress aria-label="Pending client request" size={14} sx={{ mr: 1 }} />
        ) : null}
      </ListItemButton>
      <Popover
        anchorEl={menuAnchor}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        onClose={() => {
          setMenuAnchor(null);
        }}
        open={menuAnchor !== null}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <Stack spacing={1} sx={{ p: 1 }}>
          <Button
            color="error"
            disabled={status !== 'inactive'}
            onClick={() => {
              setMenuAnchor(null);
              onDeleteRequest(entry);
            }}
            size="small"
            startIcon={<Delete />}
            variant="outlined"
          >
            Delete
          </Button>
        </Stack>
      </Popover>
    </ListItem>
  );
};

export const SessionHistory: FC = () => {
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const backendPhases = useAtomValue(allLaunchTargetPhasesAtom);
  const confirmSessionDelete = useAtomValue(confirmSessionDeleteAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);
  const refreshAllSessionRosters = useAtomSet(refreshAllSessionRostersAtomFn, { mode: 'promise' });
  const createSession = useAtomSet(createSessionAtomFn, { mode: 'promise' });
  const deleteSession = useAtomSet(deleteSessionAtomFn, { mode: 'promise' });
  const registry = useContext(RegistryContext);
  const navigate = useNavigate();
  const onClientError = useContext(OnClientErrorContext);
  const [createMenuAnchor, setCreateMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<undefined | UnifiedRosterEntry>(undefined);
  const [creating, setCreating] = useState(false);

  const noFolder = sessionCwd === undefined || listScope._tag === 'Skip';
  const anyReady = backendPhases.some(entry => entry.phase === 'ready');

  const requestDelete = (entry: UnifiedRosterEntry) => {
    if (confirmSessionDelete) {
      setDeleteTarget(entry);
      return;
    }
    deleteSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(onClientError);
  };

  const createWithAgent = (launchTarget: AgentLaunchTarget) => {
    if (sessionCwd === undefined || creating) {
      return;
    }
    setCreating(true);
    setCreateMenuAnchor(null);
    createSession({ cwd: sessionCwd, launchTarget })
      .then(() => {
        const sessionId = registry.get(selectedSessionIdAtom);
        if (sessionId !== undefined) {
          navigate({ params: { sessionId }, to: '/session/$sessionId' }).catch(() => undefined);
        }
      })
      .catch(onClientError)
      .finally(() => {
        setCreating(false);
      });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0, p: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ flex: 1, fontWeight: 600 }} variant="subtitle1">
          Sessions
        </Typography>
        <IconButton
          aria-label="Create session"
          disabled={noFolder || creating}
          onClick={(event: MouseEvent<HTMLElement>) => {
            setCreateMenuAnchor(event.currentTarget);
          }}
          size="small"
        >
          <Add fontSize="small" />
        </IconButton>
        <IconButton
          aria-label="Reload sessions"
          disabled={noFolder || !anyReady}
          onClick={() => {
            refreshAllSessionRosters(undefined).catch(onClientError);
          }}
          size="small"
        >
          <Typography component="span" sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
            ↻
          </Typography>
        </IconButton>
        <IconButton
          aria-label="Providers"
          onClick={() => {
            navigate({ to: '/providers' }).catch(() => undefined);
          }}
          size="small"
        >
          <SettingsOutlined fontSize="small" />
        </IconButton>
      </Stack>

      {noFolder ? (
        <Typography color="text.secondary" variant="body2">
          Open a workspace folder to create and list sessions.
        </Typography>
      ) : roster.length === 0 ? (
        <Stack spacing={1} sx={{ p: 1 }}>
          <Typography color="text.secondary" variant="body2">
            {anyReady
              ? 'No sessions yet. Create one to get started.'
              : 'No sessions yet. Configure a provider before creating a session.'}
          </Typography>
          {!anyReady ? (
            <Button
              onClick={() => {
                navigate({ to: '/providers' }).catch(() => undefined);
              }}
              size="small"
              variant="outlined"
            >
              Open Providers
            </Button>
          ) : null}
        </Stack>
      ) : (
        <List dense disablePadding sx={{ overflow: 'auto' }}>
          {roster.map(entry => (
            <SessionRow
              entry={entry}
              key={`${entry.launchTarget}:${entry.sessionId}`}
              onDeleteRequest={requestDelete}
              selected={selectedSessionId === entry.sessionId}
            />
          ))}
        </List>
      )}

      <Menu
        anchorEl={createMenuAnchor}
        onClose={() => {
          setCreateMenuAnchor(null);
        }}
        open={createMenuAnchor !== null}
      >
        {backendPhases.map(entry => (
          <MenuItem
            disabled={entry.phase !== 'ready' || creating}
            key={entry.launchTarget}
            onClick={() => {
              createWithAgent(entry.launchTarget);
            }}
          >
            {entry.label}
            {entry.phase !== 'ready' ? ` (${entry.phase})` : ''}
          </MenuItem>
        ))}
      </Menu>

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
              const { launchTarget, sessionId } = deleteTarget;
              deleteSession({ launchTarget, sessionId })
                .then(() => {
                  setDeleteTarget(undefined);
                })
                .catch(onClientError);
            }}
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export const ProvidersPage: FC = () => {
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
        <IconButton
          aria-label="Back to sessions"
          onClick={() => {
            navigate({ to: '/' }).catch(() => undefined);
          }}
          size="small"
        >
          <ArrowBack fontSize="small" />
        </IconButton>
        <Typography sx={{ fontWeight: 600 }} variant="subtitle1">
          Providers
        </Typography>
      </Stack>
      <ProvidersSettingsPane />
    </Box>
  );
};
