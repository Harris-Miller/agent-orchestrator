import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { Archive, Ellipsis, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { FC, SyntheticEvent } from 'react';

import { backendHarnessStateAtom } from '../../atoms/backendState.atoms.ts';
import { archiveSessionAtomFn, deactivateSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { hasSessionArchiveCapability, hasSessionCloseCapability } from '../../host/acpSessionBootstrap.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { noopClientError } from './noopClientError.ts';

// React events bubble through portals: keep menu clicks/keys from reaching an enclosing activate handler.
const stopPropagation = (event: SyntheticEvent) => {
  event.stopPropagation();
};

export const SessionActionsMenu: FC<{
  readonly entry: UnifiedHistoryEntry;
  readonly onClientError?: (error: unknown) => void;
  readonly onDeleteRequest: (entry: UnifiedHistoryEntry) => void;
  readonly sx?: { readonly mr?: number };
}> = ({ entry, onClientError = noopClientError, onDeleteRequest, sx }) => {
  const snapshot = useAtomValue(backendHarnessStateAtom(entry.launchTarget));
  const archiveSession = useAtomSet(archiveSessionAtomFn, { mode: 'promise' });
  const deactivateSession = useAtomSet(deactivateSessionAtomFn, { mode: 'promise' });
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);

  const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
  const unavailable = entry.unavailable === true || snapshot.phase !== 'ready';

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
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <Stack spacing={1} sx={{ p: 1 }}>
          {hasSessionCloseCapability(snapshot.initializeResult) ? (
            <Button
              disabled={unavailable || session?.status !== 'active'}
              onClick={() => {
                closeMenu();
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
          {hasSessionArchiveCapability(snapshot.initializeResult) ? (
            <Button
              disabled={unavailable}
              onClick={() => {
                closeMenu();
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
