import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { UnifiedHistoryEntry } from '@lib/ui';
import {
  AdditionalDirectoriesDialog,
  ensureVirtualSessionAtomFn,
  LucideMuiIcon,
  pickWorkspaceFile,
  projectDefaultsAtom,
  projectDefaultsFor,
  projectDisplayAtom,
  projectMembershipAtom,
  reloadProjectAtomFn,
  repickProjectAtomFn,
  sessionEntryKey,
  SessionHistoryRow,
  setProjectDirectoriesAtomFn,
  stopTrackingProjectAtomFn,
} from '@lib/ui';
import { hostRunPromise } from '@lib/ui/host-runtime';
import { isWorkspaceFilePath } from '@lib/hoa-home';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  Download,
  Ellipsis,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  RefreshCw,
  SquarePen,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

/** Rows a Project cwd group shows before its Show more box. */
const CWD_GROUP_ROW_LIMIT = 10;

export type ProjectGroupData = {
  readonly cwd: string;
  readonly sessions: readonly UnifiedHistoryEntry[];
};

/** A Project's Session History accordion: `⋯` menu (Import, Stop tracking), "+" and its Tracked sessions. */
export const ProjectGroup: FC<{
  readonly expansion: { readonly expanded: boolean; readonly onChange: (event: unknown, expanded: boolean) => void };
  readonly group: ProjectGroupData;
  readonly onClientError: (error: unknown) => void;
  readonly onImport: (cwd: string) => void;
  readonly onDeleteRequest: (entry: UnifiedHistoryEntry) => void;
  readonly onToggleShowMore: () => void;
  readonly rowSelection: (
    entry: UnifiedHistoryEntry,
  ) => { readonly checked: boolean; readonly onToggle: () => void } | undefined;
  readonly selectedSessionId: string | undefined;
  readonly showAllRows: boolean;
}> = ({
  expansion,
  group,
  onClientError,
  onDeleteRequest,
  onImport,
  onToggleShowMore,
  rowSelection,
  selectedSessionId,
  showAllRows,
}) => {
  const { cwd: project } = group;
  const { error, label, parentCaption } = useAtomValue(projectDisplayAtom(project));
  const { activeSessions } = useAtomValue(projectMembershipAtom(project));
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const stopTracking = useAtomSet(stopTrackingProjectAtomFn, { mode: 'promise' });
  const defaults = useAtomValue(projectDefaultsAtom);
  const setDirectories = useAtomSet(setProjectDirectoriesAtomFn, { mode: 'promise' });
  const [editingDirectories, setEditingDirectories] = useState(false);
  const reload = useAtomSet(reloadProjectAtomFn, { mode: 'promise' });
  const repick = useAtomSet(repickProjectAtomFn, { mode: 'promise' });
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const overflowCount = group.sessions.length - CWD_GROUP_ROW_LIMIT;

  const runStopTracking = () => {
    stopTracking(project).catch(onClientError);
  };

  /** Re-pick for an errored Workspace project: the chosen file replaces this Project, keeping its sessions. */
  const runRepick = () => {
    hostRunPromise(pickWorkspaceFile)
      .then(async picked => {
        if (picked !== undefined) {
          await repick({ from: project, to: picked });
        }
      })
      .catch(onClientError);
  };

  return (
    <>
      <Accordion {...expansion} sx={{ bgcolor: 'transparent', borderBottom: 0 }}>
        <AccordionSummary
          sx={{
            '&:hover': { bgcolor: 'action.hover' },
            '& .header-action': { opacity: menuAnchor === null ? 0 : 1 },
            '&:hover .header-action, &:focus-within .header-action': { opacity: 1 },
            '& .folder-open': { display: 'none' },
            '&.Mui-expanded .folder-closed': { display: 'none' },
            '&.Mui-expanded .folder-open': { display: 'inline-flex' },
            '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 0.75, m: 0, width: '100%' },
            fontWeight: 600,
            minHeight: 0,
            pl: 2,
            pr: 1.375,
            py: 1,
          }}
        >
          <LucideMuiIcon className="folder-closed" icon={Folder} sx={{ flexShrink: 0, fontSize: '1rem' }} />
          <LucideMuiIcon className="folder-open" icon={FolderOpen} sx={{ flexShrink: 0, fontSize: '1rem' }} />
          <Tooltip title={project}>
            <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
              {label}
              {parentCaption === undefined ? null : (
                <Typography color="text.secondary" component="span" sx={{ display: 'block' }} variant="caption">
                  {parentCaption}
                </Typography>
              )}
              {error === undefined ? null : (
                <Typography
                  color="error"
                  component="span"
                  sx={{ alignItems: 'center', display: 'flex', gap: 0.5 }}
                  variant="caption"
                >
                  <LucideMuiIcon icon={TriangleAlert} sx={{ fontSize: 12 }} />
                  {error}
                </Typography>
              )}
            </Box>
          </Tooltip>
          <IconButton
            aria-label={`Project actions for ${label}`}
            className="header-action"
            component="span"
            onClick={event => {
              event.stopPropagation();
              setMenuAnchor(event.currentTarget);
            }}
            size="small"
            sx={{ flexShrink: 0 }}
          >
            <LucideMuiIcon fontSize="small" icon={Ellipsis} />
          </IconButton>
          <IconButton
            aria-label={`Create session in ${label}`}
            className="header-action"
            component="span"
            disabled={error !== undefined}
            edge="end"
            onClick={event => {
              event.stopPropagation();
              ensureVirtualSession({ patchCwdIfSelectedVirtual: true, project }).catch(onClientError);
            }}
            size="small"
            sx={{ flexShrink: 0 }}
          >
            <LucideMuiIcon fontSize="small" icon={SquarePen} />
          </IconButton>
        </AccordionSummary>
        <AccordionDetails sx={{ pl: 2, pr: 0, py: 0 }}>
          {(showAllRows ? group.sessions : group.sessions.slice(0, CWD_GROUP_ROW_LIMIT)).map(entry => (
            <SessionHistoryRow
              entry={entry}
              key={sessionEntryKey(entry)}
              onClientError={onClientError}
              onDeleteRequest={onDeleteRequest}
              selected={selectedSessionId === entry.sessionId}
              selection={rowSelection(entry)}
            />
          ))}
          {overflowCount > 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, mr: 2, mt: 0.5 }}>
              <Button onClick={onToggleShowMore} size="small" variant="outlined">
                {showAllRows ? 'Show less' : `Show more (${overflowCount})`}
              </Button>
            </Box>
          ) : null}
        </AccordionDetails>
      </Accordion>
      <Menu
        anchorEl={menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
        }}
        open={menuAnchor !== null}
      >
        {error === undefined ? null : (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              reload(project).catch(onClientError);
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
              <LucideMuiIcon fontSize="small" icon={RefreshCw} />
            </ListItemIcon>
            Reload workspace file
          </MenuItem>
        )}
        {error === undefined ? null : (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              runRepick();
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
              <LucideMuiIcon fontSize="small" icon={FolderSearch} />
            </ListItemIcon>
            Re-pick workspace file…
          </MenuItem>
        )}
        {isWorkspaceFilePath(project) ? null : (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setEditingDirectories(true);
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
              <LucideMuiIcon fontSize="small" icon={FolderPlus} />
            </ListItemIcon>
            Additional directories…
          </MenuItem>
        )}
        <MenuItem
          disabled={error !== undefined}
          onClick={() => {
            setMenuAnchor(null);
            onImport(project);
          }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
            <LucideMuiIcon fontSize="small" icon={Download} />
          </ListItemIcon>
          Import
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            if (activeSessions.length === 0) {
              runStopTracking();
            } else {
              setConfirmingStop(true);
            }
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
            <LucideMuiIcon fontSize="small" icon={EyeOff} />
          </ListItemIcon>
          {error === undefined ? 'Stop tracking' : 'Remove'}
        </MenuItem>
      </Menu>
      {editingDirectories ? (
        <AdditionalDirectoriesDialog
          description={`New sessions in ${label} start with these directories as well. Sessions that already exist keep theirs.`}
          initial={projectDefaultsFor(defaults, project)}
          onClose={() => {
            setEditingDirectories(false);
          }}
          onSave={directories => {
            setDirectories({ directories, project }).catch(onClientError);
          }}
          title={`Additional directories for ${label}`}
        />
      ) : null}
      <Dialog
        onClose={() => {
          setConfirmingStop(false);
        }}
        open={confirmingStop}
      >
        <DialogTitle>Stop tracking {label}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will stop and close {activeSessions.length} active{' '}
            {activeSessions.length === 1 ? 'session' : 'sessions'}. Sessions are not deleted, and adding the Project
            again brings its tracked sessions back.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setConfirmingStop(false);
            }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            onClick={() => {
              setConfirmingStop(false);
              runStopTracking();
            }}
            variant="contained"
          >
            Stop tracking
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
