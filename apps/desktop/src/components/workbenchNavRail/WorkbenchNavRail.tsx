import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { NavSessionGroup, UnifiedHistoryEntry } from '@lib/ui';
import {
  ConfirmSessionDeleteDialog,
  ensureVirtualSessionAtomFn,
  groupAndSortSessionsForNav,
  IconTooltipButton,
  LucideMuiIcon,
  navSessionGroupStableKey,
  PanelHeader,
  refreshAllSessionHistoriesAtomFn,
  selectedSessionIdAtom,
  SessionHistoryRow,
  showNoFolderGroupAtom,
  visibleSessionHistoryAtom,
  useSessionDeleteRequest,
} from '@lib/ui';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { Folder, FolderOpen, PanelLeftClose, Plus, Settings } from 'lucide-react';
import type { FC } from 'react';

import { directoryBasename } from '../../directoryBasename.ts';

export const WORKBENCH_NAV_RAIL_WIDTH = 320;

const NO_FOLDER_TOOLTIP = 'Projectless / scratch sessions';

type NavGroupPresentation = {
  readonly createCwd: string | undefined;
  readonly key: string;
  readonly label: string;
  readonly tooltip: string;
};

const navGroupPresentation = (group: NavSessionGroup<UnifiedHistoryEntry>): NavGroupPresentation => {
  if (group.kind === 'cwd') {
    return {
      createCwd: group.cwd,
      key: navSessionGroupStableKey(group),
      label: directoryBasename(group.cwd),
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
  readonly onClientError: (error: unknown) => void;
  readonly onClose: () => void;
}> = ({ onClientError, onClose }) => {
  const history = useAtomValue(visibleSessionHistoryAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const showNoFolderGroup = useAtomValue(showNoFolderGroupAtom);
  const refreshAllSessionHistories = useAtomSet(refreshAllSessionHistoriesAtomFn, { mode: 'promise' });
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);
  const navigate = useNavigate();

  const navGroups = groupAndSortSessionsForNav(history).filter(group => group.kind !== 'noFolder' || showNoFolderGroup);

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
          closeAriaLabel="Close session history panel"
          closeIcon={PanelLeftClose}
          onClose={onClose}
          title="Sessions"
          titleEnd={
            <IconButton
              aria-label="Reload sessions"
              onClick={() => {
                refreshAllSessionHistories(undefined).catch(() => undefined);
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
            fullWidth
            onClick={() => {
              ensureVirtualSession(undefined).catch(() => undefined);
            }}
            variant="contained"
          >
            Create New Session
          </Button>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {history.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }} variant="body2">
              No sessions yet. Create one to get started.
            </Typography>
          ) : (
            <Box sx={{ py: 0.5 }}>
              {navGroups.map(group => {
                const presentation = navGroupPresentation(group);
                const createCwdForGroup = presentation.createCwd;
                return (
                  <Accordion defaultExpanded key={presentation.key} sx={{ bgcolor: 'transparent' }}>
                    <AccordionSummary
                      sx={{
                        '&:hover': {
                          bgcolor: 'action.hover',
                        },
                        '& .folder-open': { display: 'none' },
                        '&.Mui-expanded .folder-closed': { display: 'none' },
                        '&.Mui-expanded .folder-open': { display: 'inline-flex' },
                        '& .MuiAccordionSummary-content': {
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
                      <LucideMuiIcon className="folder-closed" icon={Folder} sx={{ flexShrink: 0, fontSize: '1rem' }} />
                      <LucideMuiIcon
                        className="folder-open"
                        icon={FolderOpen}
                        sx={{ flexShrink: 0, fontSize: '1rem' }}
                      />
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
                          edge="end"
                          onClick={event => {
                            event.stopPropagation();
                            ensureVirtualSession({
                              cwd: createCwdForGroup,
                              patchCwdIfSelectedVirtual: true,
                            }).catch(() => undefined);
                          }}
                          size="small"
                          sx={{ flexShrink: 0, ml: 'auto' }}
                        >
                          <LucideMuiIcon fontSize="small" icon={Plus} />
                        </IconButton>
                      ) : null}
                    </AccordionSummary>
                    <AccordionDetails sx={{ pl: 2, pr: 0, py: 0 }}>
                      {group.sessions.map(entry => (
                        <SessionHistoryRow
                          entry={entry}
                          key={`${entry.launchTarget}:${entry.sessionId}`}
                          onClientError={onClientError}
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
          <IconTooltipButton
            icon={Settings}
            label="Settings"
            onClick={() => {
              navigate({ params: { category: 'general' }, to: '/settings/$category' }).catch(() => undefined);
            }}
          />
        </Box>
      </Box>

      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} target={deleteTarget} />
    </>
  );
};
