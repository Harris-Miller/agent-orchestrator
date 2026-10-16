import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { AgentLaunchTarget, NavSessionGroup, UnifiedRosterEntry } from '@lib/ui';
import {
  AgentLaunchTargetMenu,
  allLaunchTargetPhasesAtom,
  ConfirmSessionDeleteDialog,
  createSessionAtomFn,
  groupAndSortSessionsForNav,
  navSessionGroupStableKey,
  PanelHeader,
  refreshAllSessionRostersAtomFn,
  selectedSessionIdAtom,
  SessionRosterRow,
  showNoFolderGroupAtom,
  unifiedSessionRosterAtom,
  useSessionDeleteRequest,
} from '@lib/ui';
import Add from '@mui/icons-material/Add';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { FC, MouseEvent } from 'react';

import { CreateSessionDirectoryPicker } from './CreateSessionDirectoryPicker.tsx';

export const WORKBENCH_NAV_RAIL_WIDTH = 320;

const NO_FOLDER_TOOLTIP = 'Projectless / scratch sessions';

const directoryName = (cwd: string): string => {
  const trimmed = cwd.replace(/[/\\]+$/, '');
  const segment = trimmed.split(/[/\\]/).pop();
  return segment !== undefined && segment.length > 0 ? segment : cwd;
};

type NavGroupPresentation = {
  readonly createCwd: string | undefined;
  readonly key: string;
  readonly label: string;
  readonly tooltip: string;
};

const navGroupPresentation = (group: NavSessionGroup<UnifiedRosterEntry>): NavGroupPresentation => {
  if (group.kind === 'cwd') {
    return {
      createCwd: group.cwd,
      key: navSessionGroupStableKey(group),
      label: directoryName(group.cwd),
      tooltip: group.cwd,
    };
  }
  return {
    createCwd: undefined,
    key: navSessionGroupStableKey(group),
    label: 'No Folder',
    tooltip: NO_FOLDER_TOOLTIP,
  };
};

export const WorkbenchNavRail: FC<{
  readonly onClose: () => void;
}> = ({ onClose }) => {
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const showNoFolderGroup = useAtomValue(showNoFolderGroupAtom);
  const backendPhases = useAtomValue(allLaunchTargetPhasesAtom);
  const refreshAllSessionRosters = useAtomSet(refreshAllSessionRostersAtomFn, { mode: 'promise' });
  const createSession = useAtomSet(createSessionAtomFn, { mode: 'promise' });
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [agentMenuAnchor, setAgentMenuAnchor] = useState<HTMLElement | null>(null);
  const [createCwd, setCreateCwd] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const anyReady = backendPhases.some(entry => entry.phase === 'ready');
  const navGroups = groupAndSortSessionsForNav(roster).filter(group => group.kind !== 'noFolder' || showNoFolderGroup);

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
              {navGroups.map(group => {
                const presentation = navGroupPresentation(group);
                const createCwdForGroup = presentation.createCwd;
                return (
                  <Accordion
                    defaultExpanded
                    disableGutters
                    elevation={0}
                    key={presentation.key}
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
                      <Tooltip title={presentation.tooltip}>
                        <Box
                          component="span"
                          sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}
                        >
                          {presentation.label}
                        </Box>
                      </Tooltip>
                      {createCwdForGroup !== undefined ? (
                        <IconButton
                          aria-label={`Create session in ${presentation.label}`}
                          component="span"
                          disabled={!anyReady || creating}
                          edge="end"
                          onClick={event => {
                            event.stopPropagation();
                            openAgentMenu(event, createCwdForGroup);
                          }}
                          size="small"
                          sx={{ flexShrink: 0, ml: 'auto' }}
                        >
                          <Add fontSize="small" />
                        </IconButton>
                      ) : null}
                    </AccordionSummary>
                    <AccordionDetails sx={{ pl: 2, pr: 0, py: 0 }}>
                      {group.sessions.map(entry => (
                        <SessionRosterRow
                          entry={entry}
                          key={`${entry.launchTarget}:${entry.sessionId}`}
                          onDeleteRequest={requestDelete}
                          selected={selectedSessionId === entry.sessionId}
                        />
                      ))}
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Box>
          )}
        </Box>
        <Divider />
        <Box sx={{ flexShrink: 0, p: 1 }}>
          <ListItemButton
            onClick={() => {
              navigate({ params: { category: 'general' }, to: '/settings/$category' }).catch(() => undefined);
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

      <AgentLaunchTargetMenu
        anchorEl={agentMenuAnchor}
        creating={creating}
        onClose={closeAgentMenu}
        onSelect={createWithAgent}
      />

      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} target={deleteTarget} />
    </>
  );
};
