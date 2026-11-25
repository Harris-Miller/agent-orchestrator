import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { UnifiedHistoryEntry } from '@lib/ui';
import {
  addProjectAtomFn,
  BulkActionBar,
  BulkSelectToggle,
  ConfirmSessionDeleteDialog,
  ensureVirtualSessionAtomFn,
  groupAndSortSessionsForNav,
  IconTooltipButton,
  ImportSessionsPanel,
  listedSessionHistoryAtom,
  LucideMuiIcon,
  navSessionGroupStableKey,
  PanelHeader,
  pinnedEntriesAtom,
  projectLabel,
  projectOfRecord,
  projectsAtom,
  resolveProject,
  selectedSessionIdAtom,
  sessionEntryKey,
  SessionHistoryRow,
  ShowArchivedToggle,
  useBulkSessionSelection,
  useSessionDeleteRequest,
  useSessionHistorySearch,
  visibleListedSessionHistoryAtom,
  withoutPinned,
  workspaceFilesAtom,
  workstreamsEnabledAtom,
} from '@lib/ui';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { FolderPlus, PanelLeftClose, Pin, Settings, SquarePen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

import { UpdatesIndicatorHost } from '../UpdatesIndicatorHost.tsx';
import { AppTitle } from './AppTitle.tsx';
import { PageTitle } from './PageTitle.tsx';
import { CreateSessionDirectoryPicker } from './CreateSessionDirectoryPicker.tsx';
import { ProjectGroup } from './ProjectGroup.tsx';

export const WORKBENCH_NAV_RAIL_WIDTH = 400;

/** Never a cwd (absolute paths), so it cannot clash with `navSessionGroupStableKey`. */
const PINNED_SECTION_KEY = '__pinned__';

const withKey = (keys: ReadonlySet<string>, key: string, present: boolean): ReadonlySet<string> => {
  const next = new Set(keys);
  if (present) next.add(key);
  else next.delete(key);
  return next;
};

/** A pinned row's caption: the Project it belongs to, else its directory. */
const pinnedCaption =
  (projects: readonly string[]) =>
  (entry: UnifiedHistoryEntry): string =>
    projectLabel(projectOfRecord(entry, projects) ?? entry.cwd);

export const WorkbenchNavRail: FC<{
  readonly onClientError: (error: unknown) => void;
  readonly onClose: () => void;
}> = ({ onClientError, onClose }) => {
  const history = useAtomValue(visibleListedSessionHistoryAtom);
  const listedHistory = useAtomValue(listedSessionHistoryAtom);
  const pinnedEntries = useAtomValue(pinnedEntriesAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const projects = useAtomValue(projectsAtom);
  const workspaceFiles = useAtomValue(workspaceFilesAtom);
  const workstreamsEnabled = useAtomValue(workstreamsEnabledAtom);
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const addProject = useAtomSet(addProjectAtomFn, { mode: 'promise' });
  const [addingProject, setAddingProject] = useState(false);
  /** The Project cwd whose Import replaces the rail body; undefined while Session History shows. */
  const [importing, setImporting] = useState<{ readonly cwd: string } | undefined>();
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);
  const navigate = useNavigate();
  // Each Workspace project that cannot be resolved is surfaced once as a client error (the group itself shows the reason).
  const reportedErrors = useRef(new Set<string>());
  useEffect(() => {
    const errored = new Map<string, string>();
    for (const project of projects) {
      const resolution = resolveProject(project, workspaceFiles);
      if (resolution._tag === 'Error') errored.set(project, resolution.message);
    }
    for (const [project, message] of errored) {
      if (!reportedErrors.current.has(project)) {
        reportedErrors.current.add(project);
        onClientError(new Error(`Workspace project "${projectLabel(project)}" cannot be used: ${message}`));
      }
    }
    // A fixed (or removed) Project reports again if it breaks later.
    for (const project of reportedErrors.current) {
      if (!errored.has(project)) reportedErrors.current.delete(project);
    }
  }, [onClientError, projects, workspaceFiles]);
  const search = useSessionHistorySearch({
    // Search covers every loaded Project's sessions (archived or not), nothing else.
    entries: listedHistory,
    scope: 'desktop',
    onClientError,
    selectedSessionId,
    caption: pinnedCaption(projects),
  });

  // Pinned rows render once, in the Pinned section; a Project group left with no rows keeps its header (and "+").
  const navGroups = groupAndSortSessionsForNav(history, projects).map(group => ({
    ...group,
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
            </>
          }
          closeAriaLabel="Close session history panel"
          closeIcon={PanelLeftClose}
          onClose={onClose}
          title={<AppTitle />}
        />
        {importing === undefined ? (
          <>
            {workstreamsEnabled ? <PageTitle>Sessions</PageTitle> : null}
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
              <ListItemButton
                onClick={() => {
                  setAddingProject(true);
                }}
                sx={{ borderRadius: 1, py: 0.75 }}
              >
                <ListItemIcon sx={{ color: 'text.secondary', minWidth: 32 }}>
                  <LucideMuiIcon fontSize="small" icon={FolderPlus} />
                </ListItemIcon>
                <ListItemText primary="Add Project" slotProps={{ primary: { variant: 'body2' } }} />
              </ListItemButton>
            </Box>
            <Box sx={{ pl: 2 }}>{search.field}</Box>
            <Box sx={{ flex: 1, minHeight: 0, overflow: search.active ? 'hidden' : 'auto' }}>
              {search.active ? (
                <Box sx={{ pl: 2, height: '100%', minHeight: 0 }}>{search.results}</Box>
              ) : navGroups.length === 0 && pinnedEntries.length === 0 ? (
                <Typography color="text.secondary" sx={{ p: 2 }} variant="body2">
                  No Projects yet. Add a Project to see its sessions.
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
                            caption={pinnedCaption(projects)(entry)}
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
                    const key = navSessionGroupStableKey(group);
                    return (
                      <ProjectGroup
                        expansion={sectionExpansion(key)}
                        group={group}
                        key={key}
                        onClientError={onClientError}
                        onDeleteRequest={requestDelete}
                        onImport={cwd => {
                          setImporting({ cwd });
                        }}
                        onToggleShowMore={() => {
                          toggleShowMoreBox(key);
                        }}
                        rowSelection={rowSelection}
                        selectedSessionId={selectedSessionId}
                        showAllRows={showMoreExpandedGroups.has(key)}
                      />
                    );
                  })}
                </Box>
              )}
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ImportSessionsPanel
              cwd={importing.cwd}
              onClientError={onClientError}
              onDone={() => {
                setImporting(undefined);
              }}
            />
          </Box>
        )}
        {workstreamsEnabled ? null : (
          <>
            <Divider />
            <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: 0.5, p: 1 }}>
              <IconTooltipButton
                icon={Settings}
                label="Settings"
                onClick={() => {
                  navigate({ params: { category: 'general' }, to: '/settings/$category' }).catch(() => undefined);
                }}
              />
              <UpdatesIndicatorHost />
            </Box>
          </>
        )}
      </Box>

      {addingProject ? (
        <CreateSessionDirectoryPicker
          confirmLabel="Add Project"
          onClose={() => {
            setAddingProject(false);
          }}
          onSelectDirectory={cwd => {
            addProject(cwd).catch(onClientError);
          }}
        />
      ) : null}
      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} onClientError={onClientError} target={deleteTarget} />
    </>
  );
};
