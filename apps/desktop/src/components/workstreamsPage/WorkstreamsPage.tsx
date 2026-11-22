import 'allotment/dist/style.css';

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  allotmentSashSx,
  createWorkstreamAtomFn,
  LucideMuiIcon,
  ownedSessionKeysAtom,
  PANEL_HEADER_HEIGHT,
  pendingWorkstreamAtom,
  renameWorkstreamAtomFn,
  selectedAtom,
  selectedSessionIdAtom,
  SessionChatBody,
  sessionEntryKey,
  SessionHeader,
  showArchivedSettingAtom,
  virtualSessionAtom,
  visibleSessionHistoryAtom,
  workstreamsAtom,
} from '@lib/ui';
import type { Workstream } from '@lib/hoa-home';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { WorkstreamDialog } from './WorkstreamDialog.tsx';
import { WorkstreamMenu } from './WorkstreamMenu.tsx';
import { WorkstreamSessionRow } from './WorkstreamSessionRow.tsx';

export const WorkstreamsPage: FC<{ readonly onClientError: (error: unknown) => void }> = ({ onClientError }) => {
  const workstreams = useAtomValue(workstreamsAtom);
  const history = useAtomValue(visibleSessionHistoryAtom);
  const showArchived = useAtomValue(showArchivedSettingAtom);
  const setShowArchived = useAtomSet(showArchivedSettingAtom);
  const selected = useAtomValue(selectedAtom);
  const setSelected = useAtomSet(selectedAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const owned = useAtomValue(ownedSessionKeysAtom);
  const pending = useAtomValue(pendingWorkstreamAtom);
  const setPending = useAtomSet(pendingWorkstreamAtom);
  const virtualBlob = useAtomValue(virtualSessionAtom);
  const createWorkstream = useAtomSet(createWorkstreamAtomFn, { mode: 'promise' });
  const renameWorkstream = useAtomSet(renameWorkstreamAtomFn, { mode: 'promise' });
  const [dialog, setDialog] = useState<{ readonly workstream: Workstream | undefined } | undefined>();

  // A Virtual draft is on this page only when "New session in ›" started it (it has a pending Workstream).
  const virtualHere = pending !== null && virtualBlob?.id === pending.blobId;

  // A Selected session no Workstream owns is not on this page: clear it. A Virtual draft nobody started here is only
  // hidden (see `shownSelected`); the Sessions Page keeps it.
  useEffect(() => {
    if (selected?._tag === 'Virtual') return;
    if (pending !== null) setPending(null);
    if (selected?._tag !== 'Session') return;
    const entry = history.find(candidate => candidate.sessionId === selected.sessionId);
    if (entry === undefined || !owned.has(sessionEntryKey(entry))) setSelected(undefined);
  }, [selected, history, owned, pending, setSelected, setPending]);

  // Leaving the page abandons a pending "New session in ›" join.
  useEffect(
    () => () => {
      setPending(null);
    },
    [setPending],
  );

  const shownSelected = selected?._tag === 'Virtual' && !virtualHere ? undefined : selected;

  const byKey = new Map(history.map(entry => [sessionEntryKey(entry), entry]));
  const shown = workstreams.filter(ws => showArchived || !ws.archived);

  return (
    <Box sx={theme => ({ ...allotmentSashSx(theme), height: '100%' })}>
      <Allotment>
        <Allotment.Pane minSize={280} preferredSize={380}>
          <Box
            sx={{ bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
          >
            <Stack
              direction="row"
              sx={{ alignItems: 'center', flexShrink: 0, gap: 1, height: PANEL_HEADER_HEIGHT, px: 2 }}
            >
              <Typography sx={{ flex: 1 }} variant="h6">
                Workstreams
              </Typography>
              <IconButton
                aria-label="New Workstream"
                onClick={() => {
                  setDialog({ workstream: undefined });
                }}
                size="small"
              >
                <LucideMuiIcon fontSize="small" icon={Plus} />
              </IconButton>
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={showArchived}
                  onChange={(_event, checked) => {
                    setShowArchived(checked);
                  }}
                  size="small"
                />
              }
              label={<Typography variant="caption">Show archived</Typography>}
              sx={{ px: 2 }}
            />
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {shown.map(ws => {
                const rows = ws.sessions.flatMap(session => {
                  const entry = byKey.get(sessionEntryKey(session));
                  return entry === undefined ? [] : [entry];
                });
                return (
                  <Box key={ws.id} sx={{ opacity: ws.archived ? 0.6 : 1, pb: 1 }}>
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, pl: 2, pr: 1, pt: 1 }}>
                      <Typography noWrap sx={{ flex: 1, fontWeight: 600 }} variant="body2">
                        {ws.name}
                        {ws.archived ? ' (archived)' : ''}
                      </Typography>
                      <WorkstreamMenu
                        onClientError={onClientError}
                        onEdit={() => {
                          setDialog({ workstream: ws });
                        }}
                        ws={ws}
                      />
                    </Stack>
                    {rows.map(entry => (
                      <WorkstreamSessionRow
                        entry={entry}
                        key={sessionEntryKey(entry)}
                        onClientError={onClientError}
                        selected={selectedSessionId === entry.sessionId}
                        workstreamArchived={ws.archived}
                      />
                    ))}
                    {rows.length === 0 ? (
                      <Typography color="text.disabled" sx={{ display: 'block', pl: 3 }} variant="caption">
                        No sessions. Start one, or adopt one from the Sessions Page.
                      </Typography>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Allotment.Pane>
        <Allotment.Pane minSize={320}>
          {shownSelected === undefined ? (
            <Box
              sx={{
                alignItems: 'center',
                display: 'flex',
                height: '100%',
                justifyContent: 'center',
                p: 4,
              }}
            >
              <Typography color="text.secondary" variant="body2">
                Pick a session.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
              <Box
                sx={{
                  alignItems: 'center',
                  bgcolor: 'background.paper',
                  display: 'flex',
                  flexShrink: 0,
                  height: PANEL_HEADER_HEIGHT,
                  px: 2,
                }}
              >
                <SessionHeader onClientError={onClientError} titleProps={{ variant: 'h6' }} />
              </Box>
              <SessionChatBody onClientError={onClientError} />
            </Box>
          )}
        </Allotment.Pane>
      </Allotment>
      {dialog === undefined ? null : (
        <WorkstreamDialog
          onClose={() => {
            setDialog(undefined);
          }}
          onSubmit={name => {
            const { workstream } = dialog;
            (workstream === undefined ? createWorkstream(name) : renameWorkstream({ id: workstream.id, name })).catch(
              onClientError,
            );
            setDialog(undefined);
          }}
          workstream={dialog.workstream}
        />
      )}
    </Box>
  );
};
