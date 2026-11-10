import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Search, X } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { allLaunchTargetPhasesAtom } from '../../atoms/backendState.atoms.ts';
import { sessionHistorySearchAtom } from '../../atoms/sessionHistorySearch.atoms.ts';
import { activateSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { isSessionHistoryEntryAvailable } from './isSessionHistoryEntryAvailable.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { sessionEntryKey } from '../../host/sessionEntryKey.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';
import { ConfirmSessionDeleteDialog } from './ConfirmSessionDeleteDialog.tsx';
import { filterSessionHistoryMatches } from './filterSessionHistoryMatches.ts';
import { VirtualSearchResults } from './VirtualSearchResults.tsx';
import { SessionHistoryRow } from './SessionHistoryRow.tsx';
import { useSessionDeleteRequest } from './useSessionDeleteRequest.ts';

export const useSessionHistorySearch = ({
  entries,
  scope,
  disabled = false,
  onClientError,
  selectedSessionId,
  caption,
}: {
  readonly entries: readonly UnifiedHistoryEntry[];
  readonly scope: string | undefined;
  readonly disabled?: boolean;
  readonly onClientError: (error: unknown) => void;
  readonly selectedSessionId: string | undefined;
  readonly caption?: (entry: UnifiedHistoryEntry) => string;
}) => {
  const [state, setState] = useAtom(sessionHistorySearchAtom);
  const query = state.scope === scope ? state.query : '';
  const setQuery = (value: string) => setState({ scope, query: value });
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const phases = useAtomValue(allLaunchTargetPhasesAtom);
  const activate = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);
  const trimmed = query.trim();
  const matches = useMemo(() => (trimmed ? filterSessionHistoryMatches(entries, trimmed) : []), [entries, trimmed]);
  const available = matches.filter(({ entry }) =>
    isSessionHistoryEntryAvailable(entry, phases.find(phase => phase.launchTarget === entry.launchTarget)?.phase),
  );
  const eligibleKeys = available.map(({ entry }) => sessionEntryKey(entry)).join('\n');
  const [cursor, setCursor] = useState({ query: '', eligibleKeys: '', index: 0 });
  if (cursor.query !== query || cursor.eligibleKeys !== eligibleKeys) {
    setCursor({ query, eligibleKeys, index: 0 });
  }
  const highlightedIndex = cursor.query === query && cursor.eligibleKeys === eligibleKeys ? cursor.index : 0;
  const highlighted = available[highlightedIndex] ?? available[0];
  const highlightedKey = highlighted === undefined ? undefined : sessionEntryKey(highlighted.entry);
  const clear = () => {
    setQuery('');
    inputRef.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clear();
      return;
    }
    if (event.target !== inputRef.current || event.nativeEvent.isComposing || !trimmed) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor({
        query,
        eligibleKeys,
        index: Math.max(0, Math.min(available.length - 1, highlightedIndex + (event.key === 'ArrowDown' ? 1 : -1))),
      });
    } else if (event.key === 'Enter' && highlighted) {
      event.preventDefault();
      setQuery('');
      activate({ launchTarget: highlighted.entry.launchTarget, sessionId: highlighted.entry.sessionId }).catch(
        onClientError,
      );
    }
  };
  const field = (
    <Box sx={{ flexShrink: 0, px: 1, py: 0.5 }}>
      <TextField
        fullWidth
        size="small"
        disabled={disabled}
        placeholder="Search"
        sx={{ '& .MuiInputBase-input': { py: 1.5 }, '& .MuiOutlinedInput-root': { px: '7px' } }}
        value={query}
        inputRef={inputRef}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <LucideMuiIcon fontSize="small" icon={Search} />
              </InputAdornment>
            ),
            endAdornment:
              query !== '' ? (
                <InputAdornment position="end">
                  <IconButton aria-label="Clear search" size="small" onClick={clear} sx={{ p: '2.5px' }}>
                    <LucideMuiIcon fontSize="small" icon={X} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
          },
          htmlInput: { 'aria-label': 'Search sessions', 'aria-describedby': `${id}-status` },
        }}
      />
      <Box
        id={`${id}-status`}
        aria-live="polite"
        sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}
      >
        {trimmed && highlighted ? `Highlighted ${highlighted.entry.title ?? 'New Session'}` : ''}
      </Box>
    </Box>
  );
  const results = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Typography color="text.secondary" variant="caption" sx={{ px: 2 }}>
        {matches.length} {matches.length === 1 ? 'result' : 'results'}
      </Typography>
      <VirtualSearchResults
        matches={matches}
        highlightedKey={highlightedKey}
        resetKey={`${scope}:${query}:${eligibleKeys}:${highlightedIndex}`}
        renderRow={(entry, positions, onInteractionChange) => (
          <SessionHistoryRow
            onInteractionChange={active => onInteractionChange(sessionEntryKey(entry), active)}
            caption={caption?.(entry)}
            entry={entry}
            selected={selectedSessionId === entry.sessionId}
            highlighted={highlighted !== undefined && sessionEntryKey(highlighted.entry) === sessionEntryKey(entry)}
            positions={positions}
            onActivate={() => setQuery('')}
            onClientError={onClientError}
            onDeleteRequest={requestDelete}
          />
        )}
      />
      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} onClientError={onClientError} target={deleteTarget} />
    </Box>
  );
  return { active: trimmed !== '', field, results };
};
