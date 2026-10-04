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
import { HighlightFzfChars } from '../HighlightFzfChars.tsx';
import { ListingEntryIcon } from '../sessionChat/FileChipIconView.tsx';
import { filterFsListingMatchesAll } from '../sessionChat/filterFsListingEntries.ts';

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
    return filterFsListingMatchesAll(fsListing.entries, query);
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
              const match = filtered.at(virtualRow.index);
              if (match == null) {
                return null;
              }
              const path = match.entry.path.normalize();
              const name = listingBasename(path);
              const boldTail = match.entry.kind === 'dir' ? `${name}/` : name;
              const boldFrom = Math.max(0, path.length - boldTail.length);
              return (
                <Box
                  key={virtualRow.key}
                  sx={{
                    alignItems: 'center',
                    display: 'flex',
                    gap: 0.75,
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
                  <ListingEntryIcon entry={match.entry} sx={{ fontSize: '1rem', height: '1rem', width: '1rem' }} />
                  <Typography
                    component="div"
                    noWrap
                    sx={{
                      flex: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      lineHeight: `${ROW_HEIGHT_PX}px`,
                      minWidth: 0,
                    }}
                    variant="body2"
                  >
                    <HighlightFzfChars boldFrom={boldFrom} positions={match.positions} text={path} />
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
