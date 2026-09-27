import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { AgentLaunchTarget, SessionSnapshot, UnifiedRosterEntry } from '@lib/ui';
import {
  activateSessionAtomFn,
  agentLaunchTargetLabel,
  allLaunchTargetPhasesAtom,
  backendHarnessStateAtom,
  confirmSessionDeleteAtom,
  createSessionAtomFn,
  deactivateSessionAtomFn,
  deleteSessionAtomFn,
  groupAndSortSessionsByCwd,
  refreshAllSessionRostersAtomFn,
  selectedSessionIdAtom,
  selectSessionAtomFn,
  unifiedSessionRosterAtom,
} from '@lib/ui';
import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import MoreHoriz from '@mui/icons-material/MoreHoriz';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { FC, MouseEvent } from 'react';

import { PanelHeader } from '../shared/PanelHeader.tsx';

import { CreateSessionDirectoryPicker } from './CreateSessionDirectoryPicker.tsx';

export const WORKBENCH_NAV_RAIL_WIDTH = 320;

const truncateSessionId = (sessionId: string): string =>
  sessionId.length > 12 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}` : sessionId;

const directoryName = (cwd: string): string => {
  const trimmed = cwd.replace(/[/\\]+$/, '');
  const segment = trimmed.split(/[/\\]/).pop();
  return segment !== undefined && segment.length > 0 ? segment : cwd;
};

const launchTargetIconSrc = (launchTarget: AgentLaunchTarget): string => {
  switch (launchTarget) {
    case 'claude-agent-acp':
      return '/claude_icon.svg';
    case 'codex-acp':
      return '/openai_icon.svg';
    case 'gemini-cli':
      return '/gemini_icon.svg';
  }
};

const rosterEntrySession = (
  sessionId: string,
  sessions: Readonly<Record<string, SessionSnapshot>>,
): SessionSnapshot | undefined => (sessionId in sessions ? sessions[sessionId] : undefined);

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

const SessionRow: FC<{
  readonly entry: UnifiedRosterEntry;
  readonly onDeleteRequest: (entry: UnifiedRosterEntry) => void;
  readonly selected: boolean;
}> = ({ entry, onDeleteRequest, selected }) => {
  const snapshot = useAtomValue(backendHarnessStateAtom(entry.launchTarget));
  const selectSession = useAtomSet(selectSessionAtomFn, { mode: 'promise' });
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const deactivateSession = useAtomSet(deactivateSessionAtomFn, { mode: 'promise' });
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);

  const session = rosterEntrySession(entry.sessionId, snapshot.sessions);
  const status = session?.status ?? 'inactive';
  const pendingClientRequest = session?.pendingClientRequest !== undefined;
  const displayTitle = entry.title ?? 'New Session';
  const menuOpen = menuAnchor !== null;

  const closeMenu = () => {
    setMenuAnchor(null);
  };

  const selectThisSession = () => {
    if (status !== 'active' && status !== 'activating') {
      activateSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(() => undefined);
      return;
    }
    selectSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(() => undefined);
  };

  return (
    <ListItem disablePadding sx={{ px: 1, py: 0.75 }}>
      <Paper
        elevation={0}
        onClick={selectThisSession}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectThisSession();
          }
        }}
        role="button"
        sx={sessionCardSx(selected)}
        tabIndex={0}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, px: 1.5, py: 1.25 }}>
          <Tooltip title={agentLaunchTargetLabel(entry.launchTarget)}>
            <Box
              alt=""
              component="img"
              src={launchTargetIconSrc(entry.launchTarget)}
              sx={{ display: 'block', flexShrink: 0, height: 16, width: 16 }}
            />
          </Tooltip>
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
            <MoreHoriz fontSize="small" />
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
          <Button
            disabled={status !== 'active'}
            onClick={() => {
              closeMenu();
              deactivateSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(
                () => undefined,
              );
            }}
            size="small"
            variant="outlined"
          >
            Deactivate
          </Button>
          <Button
            color="error"
            disabled={status !== 'inactive'}
            onClick={() => {
              closeMenu();
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

export const WorkbenchNavRail: FC<{
  readonly onClose: () => void;
}> = ({ onClose }) => {
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const backendPhases = useAtomValue(allLaunchTargetPhasesAtom);
  const confirmSessionDelete = useAtomValue(confirmSessionDeleteAtom);
  const refreshAllSessionRosters = useAtomSet(refreshAllSessionRostersAtomFn, { mode: 'promise' });
  const createSession = useAtomSet(createSessionAtomFn, { mode: 'promise' });
  const deleteSession = useAtomSet(deleteSessionAtomFn, { mode: 'promise' });
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<undefined | UnifiedRosterEntry>(undefined);
  const [agentMenuAnchor, setAgentMenuAnchor] = useState<HTMLElement | null>(null);
  const [createCwd, setCreateCwd] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const anyReady = backendPhases.some(entry => entry.phase === 'ready');

  const requestDelete = (entry: UnifiedRosterEntry) => {
    if (confirmSessionDelete) {
      setDeleteTarget(entry);
      return;
    }
    deleteSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(() => undefined);
  };

  const closeAgentMenu = () => {
    setAgentMenuAnchor(null);
    setCreateCwd(undefined);
  };

  const openAgentMenu = (event: MouseEvent<HTMLElement>, cwd: string) => {
    event.stopPropagation();
    setCreateCwd(cwd);
    setAgentMenuAnchor(event.currentTarget);
  };

  const createWithAgent = (launchTarget: AgentLaunchTarget) => {
    if (createCwd === undefined || creating) {
      return;
    }
    const cwd = createCwd;
    setCreating(true);
    closeAgentMenu();
    createSession({ cwd, launchTarget })
      .catch(() => undefined)
      .finally(() => {
        setCreating(false);
      });
  };

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
            <Box sx={{ py: 0.5 }}>
              {groupAndSortSessionsByCwd(roster).map(({ cwd, sessions }) => (
                <Accordion
                  defaultExpanded
                  disableGutters
                  elevation={0}
                  key={cwd}
                  square
                  sx={{
                    '&::before': { display: 'none' },
                    bgcolor: 'transparent',
                  }}
                >
                  <AccordionSummary
                    sx={{
                      '&:hover': {
                        bgcolor: 'action.hover',
                      },
                      '& .folder-open': { display: 'none' },
                      '&.Mui-expanded .folder-closed': { display: 'none' },
                      '&.Mui-expanded .folder-open': { display: 'inline-flex' },
                      '& .MuiAccordionSummary-content': {
                        alignItems: 'center',
                        gap: 0.75,
                        m: 0,
                        width: '100%',
                      },
                      fontWeight: 600,
                      minHeight: 0,
                      px: 2,
                      py: 1,
                    }}
                  >
                    <FolderOutlined className="folder-closed" sx={{ flexShrink: 0, fontSize: '1rem' }} />
                    <FolderOpenOutlined className="folder-open" sx={{ flexShrink: 0, fontSize: '1rem' }} />
                    <Tooltip title={cwd}>
                      <Box
                        component="span"
                        sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}
                      >
                        {directoryName(cwd)}
                      </Box>
                    </Tooltip>
                    <IconButton
                      aria-label={`Create session in ${directoryName(cwd)}`}
                      component="span"
                      disabled={!anyReady || creating}
                      edge="end"
                      onClick={event => {
                        event.stopPropagation();
                        openAgentMenu(event, cwd);
                      }}
                      size="small"
                      sx={{ flexShrink: 0, ml: 'auto' }}
                    >
                      <Add fontSize="small" />
                    </IconButton>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pl: 2, pr: 0, py: 0 }}>
                    {sessions.map(entry => (
                      <SessionRow
                        entry={entry}
                        key={`${entry.launchTarget}:${entry.sessionId}`}
                        onDeleteRequest={requestDelete}
                        selected={selectedSessionId === entry.sessionId}
                      />
                    ))}
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}
        </Box>
        <Divider />
        <Box sx={{ flexShrink: 0, p: 1 }}>
          <ListItemButton
            onClick={() => {
              navigate({ to: '/settings' }).catch(() => undefined);
            }}
            sx={{ borderRadius: 1 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <SettingsOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Settings" />
          </ListItemButton>
        </Box>
      </Box>

      {createOpen ? (
        <CreateSessionDirectoryPicker
          onClose={() => {
            setCreateOpen(false);
          }}
        />
      ) : null}

      <Menu
        anchorEl={agentMenuAnchor}
        onClose={() => {
          closeAgentMenu();
        }}
        open={agentMenuAnchor !== null}
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
