import 'allotment/dist/style.css';

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  allotmentSashSx,
  createWorkstreamAtomFn,
  LucideMuiIcon,
  ownedSessionKeysAtom,
  PANEL_HEADER_HEIGHT,
  selectedAtom,
  selectedSessionIdAtom,
  SessionChatBody,
  sessionEntryKey,
  SessionHeader,
  showArchivedSettingAtom,
  updateWorkstreamAtomFn,
  visibleListedSessionHistoryAtom,
  visibleSessionHistoryAtom,
  workstreamsAtom,
} from '@lib/ui';
import type { Workstream } from '@lib/hoa-home';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
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
import { trackerChipLabel } from './workstreamViews.ts';

export const WorkstreamsPage: FC<{ readonly onClientError: (error: unknown) => void }> = ({ onClientError }) => {
  const workstreams = useAtomValue(workstreamsAtom);
  const history = useAtomValue(visibleSessionHistoryAtom);
  const adoptable = useAtomValue(visibleListedSessionHistoryAtom);
  const showArchived = useAtomValue(showArchivedSettingAtom);
  const setShowArchived = useAtomSet(showArchivedSettingAtom);
  const selected = useAtomValue(selectedAtom);
  const setSelected = useAtomSet(selectedAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const owned = useAtomValue(ownedSessionKeysAtom);
  const createWorkstream = useAtomSet(createWorkstreamAtomFn, { mode: 'promise' });
  const updateWorkstream = useAtomSet(updateWorkstreamAtomFn, { mode: 'promise' });
  const [dialog, setDialog] = useState<{ readonly workstream: Workstream | undefined } | undefined>();

  // A Selected session no Workstream owns is not on this page: clear it rather than show it here.
  useEffect(() => {
    if (selected?._tag !== 'Session') return;
    const entry = history.find(candidate => candidate.sessionId === selected.sessionId);
    if (entry === undefined || !owned.has(sessionEntryKey(entry))) setSelected(undefined);
  }, [selected, history, owned, setSelected]);

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
                  const entry = byKey.get(`${session.launchTarget}:${session.sessionId}`);
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
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, pb: 0.5, px: 2 }}>
                      {ws.trackers.map(ref => (
                        <Chip
                          key={`${ref.provider}:${ref.key}`}
                          label={trackerChipLabel(ref)}
                          size="small"
                          sx={{ fontSize: '0.65rem', height: 18 }}
                          variant="outlined"
                        />
                      ))}
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
            <Typography
              color="text.secondary"
              sx={{ borderColor: 'divider', borderTop: 1, px: 2, py: 1 }}
              variant="caption"
            >
              Sessions Page sessions available to adopt: {adoptable.length}
            </Typography>
          </Box>
        </Allotment.Pane>
        <Allotment.Pane minSize={320}>
          {selected === undefined ? (
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
          onSubmit={value => {
            const { workstream } = dialog;
            (workstream === undefined
              ? createWorkstream(value)
              : updateWorkstream({ id: workstream.id, ...value })
            ).catch(onClientError);
            setDialog(undefined);
          }}
          workstream={dialog.workstream}
        />
      )}
    </Box>
  );
};
