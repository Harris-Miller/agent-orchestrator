/**
 * PROTOTYPE Workstreams Page: one plain version only. The main-area layout is deliberately not explored yet
 * (Epic #424). The rail lists Workstreams with their tracker links and sessions across Projects. Actions: adopt from
 * and orphan to the Sessions Page, archive a session, Archive a Workstream (cascades). All of it is in-memory.
 */
import { AgentLaunchTargetIcon, allotmentSashSx, LucideMuiIcon } from '@lib/ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { Archive, ArchiveRestore, Ellipsis, Unlink } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import type { TrackerRef, Workstream, WSession } from './threePagesFixtures.ts';
import { cwdCaption, PanelTitle } from './threePagesShared.tsx';
import type { StoreApi } from './threePagesShared.tsx';

const TRACKER_LABEL: Readonly<Record<TrackerRef['provider'], string>> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  jira: 'Jira',
  linear: 'Linear',
};

const WorkstreamMenu: FC<{ readonly api: StoreApi; readonly ws: Workstream }> = ({ api, ws }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [adoptAnchor, setAdoptAnchor] = useState<HTMLElement | null>(null);
  const close = () => {
    setAnchor(null);
    setAdoptAnchor(null);
  };
  return (
    <>
      <IconButton
        aria-label="Workstream actions"
        onClick={event => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
        size="small"
      >
        <LucideMuiIcon fontSize="small" icon={Ellipsis} />
      </IconButton>
      <Menu anchorEl={anchor} onClose={close} open={anchor !== null}>
        <MenuItem
          disabled={ws.archived || api.store.pool.length === 0}
          onClick={event => {
            setAdoptAnchor(event.currentTarget);
          }}
        >
          Adopt a session from the Sessions Page ›
        </MenuItem>
        <MenuItem
          disabled={ws.archived}
          onClick={() => {
            api.actions.addTracker(ws.id, { key: `HOA-${100 + ws.trackers.length}`, provider: 'linear' });
            close();
          }}
        >
          Link a tracker item (stub: adds a Linear issue)
        </MenuItem>
        <MenuItem
          onClick={() => {
            api.actions.toggleWorkstreamArchived(ws.id);
            close();
          }}
        >
          {ws.archived ? 'Unarchive Workstream (and its sessions)' : 'Archive Workstream (and its sessions)'}
        </MenuItem>
      </Menu>
      <Menu
        anchorEl={adoptAnchor}
        anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
        onClose={close}
        open={adoptAnchor !== null}
      >
        {api.store.pool.map(session => (
          <MenuItem
            key={session.key}
            onClick={() => {
              api.actions.adopt(ws.id, session.key);
              close();
            }}
          >
            <Stack>
              <Typography variant="body2">{session.title}</Typography>
              <Typography color="text.secondary" variant="caption">
                {cwdCaption(session.cwd)}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

const SessionRow: FC<{
  readonly api: StoreApi;
  readonly onOpen: () => void;
  readonly selected: boolean;
  readonly session: WSession;
  readonly ws: Workstream;
}> = ({ api, onOpen, selected, session, ws }) => (
  <Stack
    direction="row"
    onClick={onOpen}
    role="button"
    sx={{
      alignItems: 'center',
      bgcolor: selected ? 'action.selected' : 'transparent',
      cursor: 'pointer',
      gap: 1,
      opacity: session.archived ? 0.55 : 1,
      pl: 3,
      pr: 1,
      py: 0.5,
      '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
      '&:hover .row-actions': { visibility: 'visible' },
    }}
  >
    <AgentLaunchTargetIcon launchTarget={session.launchTarget} />
    <Stack sx={{ flex: 1, minWidth: 0 }}>
      <Typography noWrap variant="body2">
        {session.title}
      </Typography>
      <Typography color="text.secondary" noWrap variant="caption">
        {cwdCaption(session.cwd)}
        {session.state === 'waiting' ? ' · waiting on you' : session.state === 'running' ? ' · running' : ''}
        {session.archived ? ' · archived' : ''}
      </Typography>
    </Stack>
    <Stack className="row-actions" direction="row" sx={{ visibility: 'hidden' }}>
      <IconButton
        disabled={ws.archived}
        onClick={event => {
          event.stopPropagation();
          api.actions.toggleSessionArchived(ws.id, session.key);
        }}
        size="small"
        title={session.archived ? 'Unarchive session' : 'Archive session'}
      >
        <LucideMuiIcon fontSize="small" icon={session.archived ? ArchiveRestore : Archive} />
      </IconButton>
      <IconButton
        onClick={event => {
          event.stopPropagation();
          api.actions.orphan(ws.id, session.key);
        }}
        size="small"
        title="Orphan: move back to the Sessions Page"
      >
        <LucideMuiIcon fontSize="small" icon={Unlink} />
      </IconButton>
    </Stack>
  </Stack>
);

export const WorkstreamsPage: FC<{ readonly api: StoreApi }> = ({ api }) => {
  const [showArchived, setShowArchived] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [newName, setNewName] = useState('');
  const shown = api.store.workstreams.filter(ws => showArchived || !ws.archived);
  const selected = api.store.workstreams.flatMap(ws => ws.sessions).find(session => session.key === selectedKey);
  return (
    <Box sx={theme => ({ ...allotmentSashSx(theme), height: '100%' })}>
      <Allotment>
        <Allotment.Pane minSize={280} preferredSize={380}>
          <Box
            sx={{ bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
          >
            <PanelTitle>Workstreams</PanelTitle>
            <Stack direction="row" spacing={1} sx={{ px: 2, py: 1 }}>
              <TextField
                onChange={event => {
                  setNewName(event.target.value);
                }}
                placeholder="New Workstream name"
                size="small"
                sx={{ flex: 1 }}
                value={newName}
              />
              <Button
                disabled={newName.trim() === ''}
                onClick={() => {
                  api.actions.newWorkstream(newName.trim());
                  setNewName('');
                }}
              >
                Create
              </Button>
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
              {shown.map(ws => (
                <Box key={ws.id} sx={{ opacity: ws.archived ? 0.6 : 1, pb: 1 }}>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1, pl: 2, pr: 1, pt: 1 }}>
                    <Typography noWrap sx={{ flex: 1, fontWeight: 600 }} variant="body2">
                      {ws.name}
                      {ws.archived ? ' (archived)' : ''}
                    </Typography>
                    <WorkstreamMenu api={api} ws={ws} />
                  </Stack>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, pb: 0.5, px: 2 }}>
                    {ws.trackers.map(ref => (
                      <Chip
                        key={ref.key}
                        label={`${TRACKER_LABEL[ref.provider]} ${ref.key}`}
                        size="small"
                        sx={{ fontSize: '0.65rem', height: 18 }}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                  {ws.sessions
                    .filter(session => showArchived || !session.archived)
                    .map(session => (
                      <SessionRow
                        api={api}
                        key={session.key}
                        onOpen={() => {
                          setSelectedKey(session.key);
                        }}
                        selected={session.key === selectedKey}
                        session={session}
                        ws={ws}
                      />
                    ))}
                  {ws.sessions.length === 0 ? (
                    <Typography color="text.disabled" sx={{ display: 'block', pl: 3 }} variant="caption">
                      No sessions. Start one, or adopt one from the Sessions Page.
                    </Typography>
                  ) : null}
                </Box>
              ))}
            </Box>
            <Typography
              color="text.secondary"
              sx={{ borderColor: 'divider', borderTop: 1, px: 2, py: 1 }}
              variant="caption"
            >
              Sessions Page stand-ins available to adopt: {api.store.pool.length}
            </Typography>
          </Box>
        </Allotment.Pane>
        <Allotment.Pane minSize={320}>
          <Box
            sx={{
              alignItems: 'center',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              justifyContent: 'center',
              p: 4,
            }}
          >
            {selected === undefined ? (
              <Typography color="text.secondary" variant="body2">
                Pick a session. (The main-area layout is still undecided; this is a placeholder chat.)
              </Typography>
            ) : (
              <Stack spacing={1.5} sx={{ maxWidth: 640, width: '100%' }}>
                <Typography variant="h6">{selected.title}</Typography>
                {selected.transcript.map(line => (
                  <Typography
                    color={line.kind === 'user' ? 'text.primary' : 'text.secondary'}
                    key={`${line.kind}:${line.text}`}
                    variant="body2"
                  >
                    {line.kind === 'user' ? '› ' : ''}
                    {line.text}
                  </Typography>
                ))}
              </Stack>
            )}
          </Box>
        </Allotment.Pane>
      </Allotment>
    </Box>
  );
};
