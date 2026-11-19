import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { UnifiedHistoryEntry } from '@lib/ui';
import {
  agentLaunchTargetLabel,
  ensureVirtualSessionAtomFn,
  LucideMuiIcon,
  projectDisplayAtom,
  projectListStatusAtom,
  projectMembershipAtom,
  refreshAllSessionHistoriesAtomFn,
  retryProjectListsAtomFn,
  sessionEntryKey,
  SessionHistoryRow,
  stopTrackingProjectAtomFn,
} from '@lib/ui';
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
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Ellipsis, Folder, FolderOpen, SquarePen, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

/** Rows a Project cwd group shows before its Show more box. */
const CWD_GROUP_ROW_LIMIT = 10;

export type ProjectGroupData = {
  readonly cwd: string;
  /** The Project had no rows at all, before the pinned ones were taken out. */
  readonly empty: boolean;
  readonly sessions: readonly UnifiedHistoryEntry[];
};

/** A Project's Session History accordion: status glyph, `⋯` menu (Reload sessions, Stop tracking), "+", banner and rows. */
export const ProjectGroup: FC<{
  readonly expansion: { readonly expanded: boolean; readonly onChange: (event: unknown, expanded: boolean) => void };
  readonly group: ProjectGroupData;
  readonly onClientError: (error: unknown) => void;
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
  onToggleShowMore,
  rowSelection,
  selectedSessionId,
  showAllRows,
}) => {
  const { cwd } = group;
  const { label, parentCaption } = useAtomValue(projectDisplayAtom(cwd));
  const status = useAtomValue(projectListStatusAtom(cwd));
  const { activeSessions } = useAtomValue(projectMembershipAtom(cwd));
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const reload = useAtomSet(refreshAllSessionHistoriesAtomFn, { mode: 'promise' });
  const retry = useAtomSet(retryProjectListsAtomFn, { mode: 'promise' });
  const stopTracking = useAtomSet(stopTrackingProjectAtomFn, { mode: 'promise' });
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const overflowCount = group.sessions.length - CWD_GROUP_ROW_LIMIT;
  const failedProviders = status.incompleteLaunchTargets.map(agentLaunchTargetLabel).join(', ');

  const runStopTracking = () => {
    stopTracking(cwd).catch(onClientError);
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
          <Tooltip title={cwd}>
            <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
              {label}
              {parentCaption === undefined ? null : (
                <Typography color="text.secondary" component="span" sx={{ display: 'block' }} variant="caption">
                  {parentCaption}
                </Typography>
              )}
            </Box>
          </Tooltip>
          {status.state === 'loading' ? (
            <CircularProgress aria-label={`Loading sessions in ${label}`} size={14} sx={{ flexShrink: 0 }} />
          ) : null}
          {status.incompleteLaunchTargets.length > 0 ? (
            <Tooltip title="Some sessions didn't finish loading">
              <LucideMuiIcon icon={TriangleAlert} sx={{ color: 'warning.main', flexShrink: 0, fontSize: '1rem' }} />
            </Tooltip>
          ) : null}
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
            edge="end"
            onClick={event => {
              event.stopPropagation();
              ensureVirtualSession({ cwd, patchCwdIfSelectedVirtual: true }).catch(() => undefined);
            }}
            size="small"
            sx={{ flexShrink: 0 }}
          >
            <LucideMuiIcon fontSize="small" icon={SquarePen} />
          </IconButton>
        </AccordionSummary>
        <AccordionDetails sx={{ pl: 2, pr: 0, py: 0 }}>
          {status.state === 'loading' ? <LinearProgress sx={{ height: 2, mr: 2 }} /> : null}
          {status.incompleteLaunchTargets.length > 0 ? (
            <Box
              sx={{
                alignItems: 'center',
                bgcolor: 'action.hover',
                borderRadius: 1,
                display: 'flex',
                gap: 1,
                mb: 0.5,
                mr: 2,
                px: 1.5,
                py: 0.5,
              }}
            >
              <Typography color="warning.main" sx={{ flex: 1 }} variant="caption">
                {failedProviders} didn’t finish loading. Older sessions may be missing.
              </Typography>
              <Button
                onClick={() => {
                  retry(cwd).catch(onClientError);
                }}
                size="small"
                sx={{ textTransform: 'none' }}
              >
                Retry
              </Button>
            </Box>
          ) : null}
          {group.empty && status.state === 'complete' ? (
            <Typography color="text.secondary" sx={{ px: 2, py: 1 }} variant="body2">
              No sessions
            </Typography>
          ) : null}
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
        <MenuItem
          disabled={status.state === 'loading'}
          onClick={() => {
            setMenuAnchor(null);
            reload({ cwd }).catch(onClientError);
          }}
        >
          Reload sessions
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
          Stop tracking
        </MenuItem>
      </Menu>
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
            again brings them back.
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
