/** Dev-only virtualized view of the active session's preloaded `@` FS listing. */
import { useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import type { FC } from 'react';

import {
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  unifiedSessionRosterAtom,
} from '../../atoms/backendState.atoms.ts';
import { sessionFsListingAtom, sessionFsListingKey } from '../../atoms/sessionFsListing.atoms.ts';
import { listingBasename } from '../../host/fdListing.ts';
import { filterFsListingEntriesAll } from '../sessionChat/filterFsListingEntries.ts';

const ROW_HEIGHT_PX = 36;

export const FsMentionListingTab: FC = () => {
  const [query, setQuery] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const selectedLaunchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const roster = useAtomValue(unifiedSessionRosterAtom);

  const sourceCwd =
    selectedLaunchTarget === undefined || selectedSessionId === undefined
      ? undefined
      : roster.find(entry => entry.launchTarget === selectedLaunchTarget && entry.sessionId === selectedSessionId)?.cwd;
  const sessionCwd = selectedSession?.cwd ?? sourceCwd;
  const listingKey =
    selectedSessionId !== undefined && sessionCwd !== undefined
      ? sessionFsListingKey(selectedSessionId, sessionCwd)
      : null;
  const fsListing = useAtomValue(sessionFsListingAtom(listingKey ?? '\0'));

  const filtered = useMemo(() => {
    if (selectedSessionId === undefined || listingKey === null) {
      return [];
    }
    return filterFsListingEntriesAll(fsListing.entries, query);
  }, [fsListing.entries, listingKey, query, selectedSessionId]);

  const entryCount = selectedSessionId === undefined || listingKey === null ? 0 : fsListing.entries.length;

  // TanStack Virtual returns non-memoizable helpers; React Compiler skips this call site.
  // eslint-disable-next-line react-hooks/incompatible-library -- useVirtualizer API
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    estimateSize: () => ROW_HEIGHT_PX,
    getScrollElement: () => parentRef.current,
    overscan: 12,
    useFlushSync: false,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0, p: 1.5 }}>
        <TextField
          fullWidth
          onChange={event => {
            setQuery(event.target.value);
          }}
          placeholder="Filter paths (fzf)"
          size="small"
          value={query}
        />
        <Typography color="text.secondary" sx={{ mt: 0.75 }} variant="caption">
          {selectedSessionId === undefined
            ? 'No active session'
            : fsListing.status === 'loading'
              ? 'Loading listing…'
              : `${filtered.length} / ${entryCount} entries`}
        </Typography>
      </Box>
      <Box ref={parentRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 1.5, py: 1 }} variant="body2">
            {selectedSessionId === undefined ? 'Select a session to inspect its @ listing.' : 'No matches'}
          </Typography>
        ) : (
          <Box sx={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const entry = filtered.at(virtualRow.index);
              if (entry == null) {
                return null;
              }
              const name = listingBasename(entry.path);
              return (
                <Box
                  key={virtualRow.key}
                  sx={{
                    alignItems: 'baseline',
                    display: 'flex',
                    gap: 1,
                    height: virtualRow.size,
                    left: 0,
                    overflow: 'hidden',
                    position: 'absolute',
                    px: 1.5,
                    top: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                    width: '100%',
                  }}
                >
                  <Typography
                    component="span"
                    noWrap
                    sx={{ flexShrink: 0, fontFamily: 'monospace', fontSize: '0.75rem' }}
                    variant="body2"
                  >
                    {entry.kind === 'dir' ? `${name}/` : name}
                  </Typography>
                  <Typography
                    color="text.secondary"
                    component="span"
                    noWrap
                    sx={{ fontFamily: 'monospace', fontSize: '0.7rem', minWidth: 0 }}
                    variant="body2"
                  >
                    {entry.path}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
};
