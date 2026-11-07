import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import { useEffect, useRef } from 'react';
import type { FC, ReactNode, SyntheticEvent } from 'react';

import { backendHarnessSnapshotAtom } from '../../atoms/backendState.atoms.ts';
import { renameSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { isArchivedEntry } from '../../host/airMeta.ts';

import { noopClientError } from './noopClientError.ts';

// The enclosing History row is role=button with Enter/Space + click handlers; keep the input's events to itself.
const stopPropagation = (event: SyntheticEvent) => {
  event.stopPropagation();
};

/**
 * Session title: `children` while idle (double-click starts editing when the entry is available, not archived, and the Agent supports rename), an inline input while
 * `editing`. Enter / blur commit the trimmed title; Esc, empty or unchanged cancel without an RPC.
 */
export const SessionTitleInlineRename: FC<{
  readonly children: ReactNode;
  readonly editing: boolean;
  readonly entry: UnifiedHistoryEntry;
  readonly onClientError?: (error: unknown) => void;
  readonly onEditingChange: (editing: boolean) => void;
}> = ({ children, editing, entry, onClientError = noopClientError, onEditingChange }) => {
  const snapshot = useAtomValue(backendHarnessSnapshotAtom(entry.launchTarget));
  const renameSession = useAtomSet(renameSessionAtomFn, { mode: 'promise' });
  const settled = useRef(false);

  // Re-arm for each edit, whichever trigger (double-click or menu) starts it.
  useEffect(() => {
    if (editing) settled.current = false;
  }, [editing]);

  if (!editing) {
    return (
      <Box
        onDoubleClick={event => {
          // Codex rejects renaming archived sessions.
          if (entry.unavailable === true || isArchivedEntry(entry) || !snapshot.agentCapabilities.sessionRename) return;
          event.stopPropagation();
          onEditingChange(true);
        }}
        sx={{ flex: 1, minWidth: 0 }}
      >
        {children}
      </Box>
    );
  }

  const finish = (value: string | undefined) => {
    if (settled.current) return;
    settled.current = true;
    onEditingChange(false);
    const title = value?.trim();
    if (title === undefined || title === '' || title === entry.title) return;
    renameSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId, title }).catch(onClientError);
  };

  return (
    <InputBase
      autoFocus
      defaultValue={entry.title ?? ''}
      inputProps={{ 'aria-label': 'Session title' }}
      onBlur={event => {
        finish(event.target.value);
      }}
      onClick={stopPropagation}
      onDoubleClick={stopPropagation}
      onFocus={event => {
        event.target.select();
      }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(undefined);
        } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          finish((event.target as HTMLInputElement).value);
        }
      }}
      onPointerDown={stopPropagation}
      size="small"
      sx={{ flex: 1, fontSize: 'inherit', minWidth: 0 }}
    />
  );
};
