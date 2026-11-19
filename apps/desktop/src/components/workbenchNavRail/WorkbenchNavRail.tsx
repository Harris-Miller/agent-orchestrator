import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { NavSessionGroup, UnifiedHistoryEntry } from '@lib/ui';
import {
  BulkActionBar,
  BulkSelectToggle,
  ConfirmSessionDeleteDialog,
  directoryBasename,
  ensureVirtualSessionAtomFn,
  groupAndSortSessionsForNav,
  IconTooltipButton,
  LucideMuiIcon,
  navSessionGroupStableKey,
  PanelHeader,
  pinnedEntriesAtom,
  projectsAtom,
  refreshAllSessionHistoriesAtomFn,
  removeProjectAtomFn,
  selectedSessionIdAtom,
  sessionEntryKey,
  SessionHistoryRow,
  ShowArchivedToggle,
  unifiedSessionHistoryAtom,
  useBulkSessionSelection,
  useSessionDeleteRequest,
  useSessionHistorySearch,
  visibleSessionHistoryAtom,
  withoutPinned,
} from '@lib/ui';
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
import { Folder, FolderOpen, PanelLeftClose, Pin, Plus, RotateCw, Settings, SquarePen, X } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

export const WORKBENCH_NAV_RAIL_WIDTH = 400;

/** Never a cwd (absolute paths), so it cannot clash with `navSessionGroupStableKey`. */
const PINNED_SECTION_KEY = '__pinned__';
/** Rows a Session History cwd group shows before its Show more box. */
const CWD_GROUP_ROW_LIMIT = 10;
// Panel widths (px) at which the header title grows from "HOA" to "The HOA" to the full name; leaves room for header actions.
// Kept just under WORKBENCH_NAV_RAIL_WIDTH so the full name shows at the default width.
const TITLE_MEDIUM_MIN_WIDTH = 260;
const TITLE_FULL_MIN_WIDTH = 390;

const withKey = (keys: ReadonlySet<string>, key: string, present: boolean): ReadonlySet<string> => {
  const next = new Set(keys);
  if (present) next.add(key);
  else next.delete(key);
  return next;
};

const pinnedCaption = (entry: UnifiedHistoryEntry): string => directoryBasename(entry.cwd);

type NavGroupPresentation = {
  readonly createCwd: string;
  readonly key: string;
  readonly label: string;
  readonly tooltip: string;
};

const navGroupPresentation = (group: NavSessionGroup<UnifiedHistoryEntry>): NavGroupPresentation => ({
  createCwd: group.cwd,
  key: navSessionGroupStableKey(group),
  label: directoryBasename(group.cwd),
  tooltip: group.cwd,
});

export const WorkbenchNavRail: FC<{
  readonly onClientError: (error: unknown) => void;
  readonly onClose: () => void;
}> = ({ onClientError, onClose }) => {
  const history = useAtomValue(visibleSessionHistoryAtom);
  const unifiedHistory = useAtomValue(unifiedSessionHistoryAtom);
  const pinnedEntries = useAtomValue(pinnedEntriesAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const projects = useAtomValue(projectsAtom);
  const refreshAllSessionHistories = useAtomSet(refreshAllSessionHistoriesAtomFn, { mode: 'promise' });
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const removeProject = useAtomSet(removeProjectAtomFn, { mode: 'promise' });
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);
  const navigate = useNavigate();
  const search = useSessionHistorySearch({
    entries: unifiedHistory,
    scope: 'desktop',
    onClientError,
    selectedSessionId,
    caption: pinnedCaption,
  });

  // Pinned rows render once, in the Pinned section; a group left with no rows keeps its header (and "+"). A group is
  // empty (and can be untracked) only when it had no rows before the pinned ones were taken out.
  const navGroups = groupAndSortSessionsForNav(history, projects).map(group => ({
    ...group,
    empty: group.sessions.length === 0,
    sessions: withoutPinned(group.sessions, pinnedEntries),
  }));

  // Exactly the rows the rail renders (rows behind Show more or a collapsed section stay selectable).
  const bulk = useBulkSessionSelection(
    [...pinnedEntries, ...navGroups.flatMap(group => group.sessions)],
    search.active,
  );
  const rowSelection = (entry: UnifiedHistoryEntry) =>
    bulk.active
      ? {
          checked: bulk.isSelected(entry),
          onToggle: () => {
            bulk.toggle(entry);
          },
        }
      : undefined;
  // Section keys the user collapsed. Held here, not in each Accordion, so a section that unmounts and remounts (Show
  // archived, a list refresh) keeps its state; only a header click changes it.
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(new Set());
  const sectionExpansion = (key: string) => ({
    expanded: !collapsedSections.has(key),
    onChange: (_event: unknown, expanded: boolean) => {
      setCollapsedSections(current => withKey(current, key, !expanded));
    },
  });

  // Group keys whose Show more box shows all rows. Held here so it survives Accordion remounts (accordion collapse,
  // Show archived, a list refresh); resets on reload.
  const [showMoreExpandedGroups, setShowMoreExpandedGroups] = useState<ReadonlySet<string>>(new Set());
  const toggleShowMoreBox = (key: string) => {
    setShowMoreExpandedGroups(current => withKey(current, key, !current.has(key)));
  };

  return (
    <>
      <Box
        sx={{
          bgcolor: 'background.paper',
          boxSizing: 'border-box',
          containerType: 'inline-size',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
        }}
      >
        <PanelHeader
          beforeClose={
            <>
              <BulkSelectToggle active={bulk.active} disabled={search.active} onToggle={bulk.toggleMode} />
              <ShowArchivedToggle />
              <IconTooltipButton
                icon={RotateCw}
                label="Reload sessions"
                onClick={() => {
                  refreshAllSessionHistories(undefined).catch(() => undefined);
                }}
              />
            </>
          }
          closeAriaLabel="Close session history panel"
          closeIcon={PanelLeftClose}
          onClose={onClose}
          title={
            <Typography
              noWrap
              sx={{
                fontWeight: 600,
                // Title shortens with the panel width: full name, then "The HOA", then "HOA".
                '& .title-full, & .title-medium': { display: 'none' },
                [`@container (min-width: ${TITLE_MEDIUM_MIN_WIDTH}px)`]: {
                  '& .title-medium': { display: 'inline' },
                  '& .title-short': { display: 'none' },
                },
                [`@container (min-width: ${TITLE_FULL_MIN_WIDTH}px)`]: {
                  '& .title-full': { display: 'inline' },
                  '& .title-medium': { display: 'none' },
                },
              }}
              variant="subtitle1"
            >
              <span className="title-full">Harness Orchestrating Agents</span>
              <span className="title-medium">The HOA</span>
              <span className="title-short">HOA</span>
            </Typography>
          }
        />
        <BulkActionBar onClientError={onClientError} selection={bulk} />
        <Box sx={{ flexShrink: 0, pt: 1, px: 1 }}>
          <ListItemButton
            onClick={() => {
              ensureVirtualSession(undefined).catch(() => undefined);
            }}
            sx={{ borderRadius: 1, py: 0.75 }}
          >
            <ListItemIcon sx={{ color: 'text.secondary', minWidth: 32 }}>
              <LucideMuiIcon fontSize="small" icon={SquarePen} />
            </ListItemIcon>
            <ListItemText primary="New Session" slotProps={{ primary: { variant: 'body2' } }} />
          </ListItemButton>
        </Box>
        <Box sx={{ pl: 2 }}>{search.field}</Box>
        <Box sx={{ flex: 1, minHeight: 0, overflow: search.active ? 'hidden' : 'auto' }}>
          {search.active ? (
            <Box sx={{ pl: 2, height: '100%', minHeight: 0 }}>{search.results}</Box>
          ) : history.length === 0 && navGroups.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }} variant="body2">
              No sessions yet. Create one to get started.
            </Typography>
          ) : (
            <Box sx={{ py: 0.5 }}>
              {pinnedEntries.length > 0 ? (
                <Accordion
                  {...sectionExpansion(PINNED_SECTION_KEY)}
                  key={PINNED_SECTION_KEY}
                  sx={{ bgcolor: 'transparent', borderBottom: 0 }}
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
                        key={sessionEntryKey(entry)}
                        onClientError={onClientError}
                        onDeleteRequest={requestDelete}
                        selected={selectedSessionId === entry.sessionId}
                        selection={rowSelection(entry)}
                      />
                    ))}
                  </AccordionDetails>
                </Accordion>
              ) : null}
              {navGroups.map(group => {
                const presentation = navGroupPresentation(group);
                const showAllRows = showMoreExpandedGroups.has(presentation.key);
                const overflowCount = group.sessions.length - CWD_GROUP_ROW_LIMIT;
                return (
                  <Accordion
                    {...sectionExpansion(presentation.key)}
                    key={presentation.key}
                    sx={{ bgcolor: 'transparent', borderBottom: 0 }}
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
                      {group.empty ? (
                        <Tooltip title="Untrack folder">
                          <IconButton
                            aria-label={`Untrack ${presentation.label}`}
                            component="span"
                            onClick={event => {
                              event.stopPropagation();
                              removeProject(group.cwd).catch(() => undefined);
                            }}
                            size="small"
                            sx={{ flexShrink: 0, ml: 'auto' }}
                          >
                            <LucideMuiIcon fontSize="small" icon={X} />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      <IconButton
                        aria-label={`Create session in ${presentation.label}`}
                        component="span"
                        edge="end"
                        onClick={event => {
                          event.stopPropagation();
                          ensureVirtualSession({
                            cwd: presentation.createCwd,
                            patchCwdIfSelectedVirtual: true,
                          }).catch(() => undefined);
                        }}
                        size="small"
                        sx={{ flexShrink: 0, ml: 'auto' }}
                      >
                        <LucideMuiIcon fontSize="small" icon={Plus} />
                      </IconButton>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pl: 2, pr: 0, py: 0 }}>
                      {group.empty ? (
                        <Typography color="text.secondary" sx={{ px: 2, py: 1 }} variant="body2">
                          No sessions
                        </Typography>
                      ) : null}
                      {(showAllRows ? group.sessions : group.sessions.slice(0, CWD_GROUP_ROW_LIMIT)).map(entry => (
                        <SessionHistoryRow
                          entry={entry}
                          key={sessionEntryKey(entry)}
                          onClientError={onClientError}
                          onDeleteRequest={requestDelete}
                          selected={selectedSessionId === entry.sessionId}
                          selection={rowSelection(entry)}
                        />
                      ))}
                      {overflowCount > 0 ? (
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            mb: 1,
                            mr: 2,
                            mt: 0.5,
                          }}
                        >
                          <Button
                            onClick={() => {
                              toggleShowMoreBox(presentation.key);
                            }}
                            size="small"
                            variant="outlined"
                          >
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

      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} onClientError={onClientError} target={deleteTarget} />
    </>
  );
};
