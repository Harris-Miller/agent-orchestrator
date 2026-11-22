import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { Workstream } from '@lib/hoa-home';
import {
  adoptSessionAtomFn,
  deleteWorkstreamAtomFn,
  directoryBasename,
  LucideMuiIcon,
  projectsAtom,
  setWorkstreamArchivedAtomFn,
  startSessionInWorkstreamAtomFn,
  visibleListedSessionHistoryAtom,
} from '@lib/ui';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { cwdCaption } from './workstreamViews.ts';

type Submenu = 'adopt' | 'new';

export const WorkstreamMenu: FC<{
  readonly onClientError: (error: unknown) => void;
  readonly onEdit: () => void;
  readonly ws: Workstream;
}> = ({ onClientError, onEdit, ws }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [sub, setSub] = useState<{ readonly anchor: HTMLElement; readonly kind: Submenu } | null>(null);
  const projects = useAtomValue(projectsAtom);
  const adoptable = useAtomValue(visibleListedSessionHistoryAtom);
  const startSession = useAtomSet(startSessionInWorkstreamAtomFn, { mode: 'promise' });
  const adopt = useAtomSet(adoptSessionAtomFn, { mode: 'promise' });
  const setArchived = useAtomSet(setWorkstreamArchivedAtomFn, { mode: 'promise' });
  const deleteWorkstream = useAtomSet(deleteWorkstreamAtomFn, { mode: 'promise' });
  const close = () => {
    setAnchor(null);
    setSub(null);
  };
  const run = (action: Promise<unknown>) => {
    close();
    action.catch(onClientError);
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
          onClick={() => {
            close();
            onEdit();
          }}
        >
          Edit…
        </MenuItem>
        <MenuItem
          disabled={ws.archived || projects.length === 0}
          onClick={event => {
            setSub({ anchor: event.currentTarget, kind: 'new' });
          }}
        >
          New session in ›
        </MenuItem>
        <MenuItem
          disabled={ws.archived || adoptable.length === 0}
          onClick={event => {
            setSub({ anchor: event.currentTarget, kind: 'adopt' });
          }}
        >
          Adopt a session from the Sessions Page ›
        </MenuItem>
        <MenuItem
          onClick={() => {
            run(setArchived({ archived: !ws.archived, id: ws.id }));
          }}
        >
          {ws.archived ? 'Unarchive Workstream (and its sessions)' : 'Archive Workstream (and its sessions)'}
        </MenuItem>
        <MenuItem
          onClick={() => {
            run(deleteWorkstream(ws.id));
          }}
        >
          Delete Workstream (sessions return to the Sessions Page)
        </MenuItem>
      </Menu>
      <Menu
        anchorEl={sub?.anchor}
        anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
        onClose={close}
        open={sub !== null}
      >
        {sub?.kind === 'new'
          ? projects.map(cwd => (
              <MenuItem
                key={cwd}
                onClick={() => {
                  run(startSession({ cwd, workstreamId: ws.id }));
                }}
              >
                {directoryBasename(cwd)}
              </MenuItem>
            ))
          : adoptable.map(entry => (
              <MenuItem
                key={`${entry.launchTarget}:${entry.sessionId}`}
                onClick={() => {
                  run(
                    adopt({
                      session: { launchTarget: entry.launchTarget, sessionId: entry.sessionId },
                      workstreamId: ws.id,
                    }),
                  );
                }}
              >
                <Stack>
                  <Typography variant="body2">{entry.title ?? 'New Session'}</Typography>
                  <Typography color="text.secondary" variant="caption">
                    {cwdCaption(entry.cwd)}
                  </Typography>
                </Stack>
              </MenuItem>
            ))}
      </Menu>
    </>
  );
};
