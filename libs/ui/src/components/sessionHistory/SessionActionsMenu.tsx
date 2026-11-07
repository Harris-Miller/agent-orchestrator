import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { Archive, ArchiveRestore, Ellipsis, Pencil, Pin, PinOff, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { FC, SyntheticEvent } from 'react';

import { backendHarnessSnapshotAtom } from '../../atoms/backendState.atoms.ts';
import {
  activateSessionAtomFn,
  archiveSessionAtomFn,
  deactivateSessionAtomFn,
  pinSessionAtomFn,
  unpinSessionAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from '../../atoms/pinnedSessions.atoms.ts';
import { isUsablePhase } from '../../host/acpSessionBootstrap.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { isArchivedEntry } from '../../host/airMeta.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { noopClientError } from './noopClientError.ts';

// React events bubble through portals: keep menu clicks/keys from reaching an enclosing activate handler.
const stopPropagation = (event: SyntheticEvent) => {
  event.stopPropagation();
};

/** On an archived entry: Unarchive (then opens it), Pin/Unpin and Delete only (Codex rejects renaming archived sessions). */
export const SessionActionsMenu: FC<{
  readonly entry: UnifiedHistoryEntry;
  readonly onBeforeAction?: () => void;
  readonly onClientError?: (error: unknown) => void;
  readonly onDeleteRequest: (entry: UnifiedHistoryEntry) => void;
  readonly onRenameRequest?: () => void;
  readonly sx?: { readonly mr?: number };
}> = ({ entry, onBeforeAction, onClientError = noopClientError, onDeleteRequest, onRenameRequest, sx }) => {
  const snapshot = useAtomValue(backendHarnessSnapshotAtom(entry.launchTarget));
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const archiveSession = useAtomSet(archiveSessionAtomFn, { mode: 'promise' });
  const deactivateSession = useAtomSet(deactivateSessionAtomFn, { mode: 'promise' });
  const pinSession = useAtomSet(pinSessionAtomFn, { mode: 'promise' });
  const unpinSession = useAtomSet(unpinSessionAtomFn, { mode: 'promise' });
  const pinsLoaded = useAtomValue(pinsLoadedAtom(entry.launchTarget));
  const pinned = useAtomValue(pinnedSessionsAtom(entry.launchTarget)).some(pin => pin.sessionId === entry.sessionId);
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);

  const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
  const unavailable = entry.unavailable === true || !isUsablePhase(snapshot.phase);
  const archived = isArchivedEntry(entry);
  const { sessionArchive, sessionClose, sessionRename } = snapshot.agentCapabilities;

  // MUI returns focus to the trigger when the Popover closes; start editing only after that, or the input blur-commits.
  const renameRequested = useRef(false);

  const closeMenu = () => {
    setMenuAnchor(null);
  };

  return (
    <>
      <IconButton
        aria-label="Session actions"
        onClick={event => {
          event.stopPropagation();
          setMenuAnchor(event.currentTarget);
        }}
        onKeyDown={stopPropagation}
        size="small"
        sx={{ flexShrink: 0, ...sx }}
      >
        <LucideMuiIcon fontSize="small" icon={Ellipsis} />
      </IconButton>

      <Popover
        anchorEl={menuAnchor}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        onClick={stopPropagation}
        onClose={closeMenu}
        onKeyDown={stopPropagation}
        open={menuAnchor !== null}
        slotProps={{
          transition: {
            onExited: () => {
              if (renameRequested.current) {
                renameRequested.current = false;
                onRenameRequest?.();
              }
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <Stack spacing={1} sx={{ p: 1 }}>
          {archived && sessionArchive ? (
            <Button
              disabled={unavailable}
              onClick={() => {
                closeMenu();
                // Opens this session, so no onBeforeAction (it may select Virtual).
                activateSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(onClientError);
              }}
              size="small"
              startIcon={<LucideMuiIcon icon={ArchiveRestore} />}
              variant="outlined"
            >
              Unarchive
            </Button>
          ) : null}
          {/* Pinning is local-only: it works for unavailable rows and must not run onBeforeAction. */}
          <Button
            disabled={!pinsLoaded}
            onClick={() => {
              closeMenu();
              const target = { launchTarget: entry.launchTarget, sessionId: entry.sessionId };
              (pinned ? unpinSession(target) : pinSession({ ...target, cwd: entry.cwd })).catch(onClientError);
            }}
            size="small"
            startIcon={<LucideMuiIcon icon={pinned ? PinOff : Pin} />}
            variant="outlined"
          >
            {pinned ? 'Unpin' : 'Pin'}
          </Button>
          {!archived && sessionClose ? (
            <Button
              disabled={unavailable || session?.status !== 'active'}
              onClick={() => {
                closeMenu();
                onBeforeAction?.();
                deactivateSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(
                  onClientError,
                );
              }}
              size="small"
              startIcon={<LucideMuiIcon icon={X} />}
              variant="outlined"
            >
              Close
            </Button>
          ) : null}
          {!archived && onRenameRequest !== undefined && entry.unavailable !== true && sessionRename ? (
            <Button
              disabled={!isUsablePhase(snapshot.phase)}
              onClick={() => {
                renameRequested.current = true;
                closeMenu();
              }}
              size="small"
              startIcon={<LucideMuiIcon icon={Pencil} />}
              variant="outlined"
            >
              Rename
            </Button>
          ) : null}
          {!archived && sessionArchive ? (
            <Button
              disabled={unavailable}
              onClick={() => {
                closeMenu();
                onBeforeAction?.();
                archiveSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(onClientError);
              }}
              size="small"
              startIcon={<LucideMuiIcon icon={Archive} />}
              variant="outlined"
            >
              Archive
            </Button>
          ) : null}
          <Button
            color="error"
            disabled={unavailable}
            onClick={() => {
              closeMenu();
              onDeleteRequest(entry);
            }}
            size="small"
            startIcon={<LucideMuiIcon icon={Trash2} />}
            variant="outlined"
          >
            Delete
          </Button>
        </Stack>
      </Popover>
    </>
  );
};
