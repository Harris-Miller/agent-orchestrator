import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { NavSessionGroup, UnifiedHistoryEntry } from '@lib/ui';
import {
  ConfirmSessionDeleteDialog,
  directoryBasename,
  ensureVirtualSessionAtomFn,
  groupAndSortSessionsForNav,
  IconTooltipButton,
  isNoFolderSessionCwd,
  LucideMuiIcon,
  navSessionGroupStableKey,
  PanelHeader,
  pinnedEntriesAtom,
  refreshAllSessionHistoriesAtomFn,
  selectedSessionIdAtom,
  SessionHistoryRow,
  ShowArchivedToggle,
  showNoFolderGroupAtom,
  useSessionDeleteRequest,
  visibleSessionHistoryAtom,
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
import { Folder, FolderOpen, PanelLeftClose, Pin, Plus, Settings } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

export const WORKBENCH_NAV_RAIL_WIDTH = 320;

/** Never a cwd (absolute paths), so it cannot clash with `navSessionGroupStableKey`. */
const PINNED_SECTION_KEY = '__pinned__';
/** Rows a Session History cwd group shows before its Show more box. */
const SESSION_GROUP_LIMIT = 10;

const pinnedKey = (entry: UnifiedHistoryEntry): string => `${entry.launchTarget}:${entry.sessionId}`;

const pinnedCaption = (entry: UnifiedHistoryEntry): string =>
  isNoFolderSessionCwd(entry.cwd) ? 'No Folder' : directoryBasename(entry.cwd);

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
  const pinnedEntries = useAtomValue(pinnedEntriesAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const showNoFolderGroup = useAtomValue(showNoFolderGroupAtom);
  const refreshAllSessionHistories = useAtomSet(refreshAllSessionHistoriesAtomFn, { mode: 'promise' });
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);
  const navigate = useNavigate();
  // Section keys the user collapsed. Held here, not in each Accordion, so a section that unmounts and remounts (Show
  // archived, a list refresh) keeps its state; only a header click changes it.
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(new Set());
  const sectionExpansion = (key: string) => ({
    expanded: !collapsedSections.has(key),
    onChange: (_event: unknown, expanded: boolean) => {
      setCollapsedSections(current => {
        const next = new Set(current);
        if (expanded) next.delete(key);
        else next.add(key);
        return next;
      });
    },
  });

  // Group keys whose Show more box shows all rows. Held here so it survives Accordion remounts (accordion collapse,
  // Show archived, a list refresh); resets on reload.
  const [showAllGroups, setShowAllGroups] = useState<ReadonlySet<string>>(new Set());
  const toggleShowAll = (key: string) => {
    setShowAllGroups(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const pinnedKeys = new Set(pinnedEntries.map(pinnedKey));
  // Pinned rows render once, in the Pinned section; a group left with no rows keeps its header (and "+").
  const navGroups = groupAndSortSessionsForNav(history)
    .filter(group => group.kind !== 'noFolder' || showNoFolderGroup)
    .map(group => ({ ...group, sessions: group.sessions.filter(entry => !pinnedKeys.has(pinnedKey(entry))) }));

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
            <>
              <ShowArchivedToggle />
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
            </>
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
              {pinnedEntries.length > 0 ? (
                <Accordion
                  {...sectionExpansion(PINNED_SECTION_KEY)}
                  key={PINNED_SECTION_KEY}
                  sx={{ bgcolor: 'transparent' }}
                >
                  <AccordionSummary
                    sx={{
                      '&:hover': { bgcolor: 'action.hover' },
                      '& .MuiAccordionSummary-content': { gap: 0.75, m: 0, width: '100%' },
                      fontWeight: 600,
                      minHeight: 0,
                      px: 2,
                      py: 1,
                    }}
                  >
                    <LucideMuiIcon icon={Pin} sx={{ flexShrink: 0, fontSize: '1rem' }} />
                    <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                      Pinned
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pl: 2, pr: 0, py: 0 }}>
                    {pinnedEntries.map(entry => (
                      <SessionHistoryRow
                        caption={pinnedCaption(entry)}
                        entry={entry}
                        key={pinnedKey(entry)}
                        onClientError={onClientError}
                        onDeleteRequest={requestDelete}
                        selected={selectedSessionId === entry.sessionId}
                      />
                    ))}
                  </AccordionDetails>
                </Accordion>
              ) : null}
              {navGroups.map(group => {
                const presentation = navGroupPresentation(group);
                const createCwdForGroup = presentation.createCwd;
                const showAllRows = showAllGroups.has(presentation.key);
                const overflowCount = group.sessions.length - SESSION_GROUP_LIMIT;
                return (
                  <Accordion
                    {...sectionExpansion(presentation.key)}
                    key={presentation.key}
                    sx={{ bgcolor: 'transparent' }}
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
                      {(showAllRows ? group.sessions : group.sessions.slice(0, SESSION_GROUP_LIMIT)).map(entry => (
                        <SessionHistoryRow
                          entry={entry}
                          key={`${entry.launchTarget}:${entry.sessionId}`}
                          onClientError={onClientError}
                          onDeleteRequest={requestDelete}
                          selected={selectedSessionId === entry.sessionId}
                        />
                      ))}
                      {overflowCount > 0 ? (
                        <Box
                          sx={{
                            alignItems: 'center',
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            display: 'flex',
                            justifyContent: 'center',
                            mb: 1,
                            mr: 2,
                            mt: 0.5,
                            px: 0.5,
                          }}
                        >
                          <Button onClick={() => toggleShowAll(presentation.key)} size="small">
                            {showAllRows ? 'Show less' : `Show more (${overflowCount})`}
                          </Button>
                        </Box>
                      ) : null}
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
