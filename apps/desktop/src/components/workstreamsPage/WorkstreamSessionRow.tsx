import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { UnifiedHistoryEntry } from '@lib/ui';
import {
  activateSessionAtomFn,
  AgentLaunchTargetIcon,
  archiveSessionAtomFn,
  backendHarnessSnapshotAtom,
  cwdCaption,
  LucideMuiIcon,
  orphanSessionAtomFn,
  unarchiveSessionAtomFn,
} from '@lib/ui';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Archive, ArchiveRestore, Unlink } from 'lucide-react';
import type { FC } from 'react';

export const WorkstreamSessionRow: FC<{
  readonly entry: UnifiedHistoryEntry;
  readonly onClientError: (error: unknown) => void;
  readonly selected: boolean;
  readonly workstreamArchived: boolean;
}> = ({ entry, onClientError, selected, workstreamArchived }) => {
  const activate = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const archive = useAtomSet(archiveSessionAtomFn, { mode: 'promise' });
  const unarchive = useAtomSet(unarchiveSessionAtomFn, { mode: 'promise' });
  const orphan = useAtomSet(orphanSessionAtomFn, { mode: 'promise' });
  const snapshot = useAtomValue(backendHarnessSnapshotAtom(entry.launchTarget));
  const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
  const archived = entry.archived === true;
  const target = { launchTarget: entry.launchTarget, sessionId: entry.sessionId };
  return (
    <Stack
      direction="row"
      onClick={() => {
        activate(target).catch(onClientError);
      }}
      role="button"
      sx={{
        alignItems: 'center',
        bgcolor: selected ? 'action.selected' : 'transparent',
        cursor: 'pointer',
        gap: 1,
        opacity: archived ? 0.55 : 1,
        pl: 3,
        pr: 1,
        py: 0.5,
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
        '&:hover .row-actions': { visibility: 'visible' },
      }}
    >
      <AgentLaunchTargetIcon launchTarget={entry.launchTarget} />
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap variant="body2">
          {entry.title ?? 'New Session'}
        </Typography>
        <Typography color="text.secondary" noWrap variant="caption">
          {cwdCaption(entry.cwd)}
          {session?.pendingClientRequest === undefined ? '' : ' · waiting on you'}
          {archived ? ' · archived' : ''}
        </Typography>
      </Stack>
      <Stack className="row-actions" direction="row" sx={{ visibility: 'hidden' }}>
        <IconButton
          disabled={workstreamArchived}
          onClick={event => {
            event.stopPropagation();
            (archived ? unarchive(target) : archive(target)).catch(onClientError);
          }}
          size="small"
          title={archived ? 'Unarchive session' : 'Archive session'}
        >
          <LucideMuiIcon fontSize="small" icon={archived ? ArchiveRestore : Archive} />
        </IconButton>
        <IconButton
          onClick={event => {
            event.stopPropagation();
            orphan(target).catch(onClientError);
          }}
          size="small"
          title="Orphan: move back to the Sessions Page"
        >
          <LucideMuiIcon fontSize="small" icon={Unlink} />
        </IconButton>
      </Stack>
    </Stack>
  );
};
