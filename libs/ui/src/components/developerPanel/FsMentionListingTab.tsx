/** Dev-only virtualized view of the active session's preloaded `@` FS listing. */
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import type { FC } from 'react';

import { useSelectedSessionFsListing } from '../../atoms/useSelectedSessionFsListing.ts';
import { listingPathBoldFrom } from '../../host/fdListing.ts';
import { HighlightFzfChars } from '../HighlightFzfChars.tsx';
import { ListingEntryIcon } from '../sessionChat/FileChipIconView.tsx';
import { filterFsListingMatches } from '../sessionChat/filterFsListingEntries.ts';
import { Input } from '../ui/input.tsx';

const ROW_HEIGHT_PX = 36;

export const FsMentionListingTab: FC = () => {
  const [query, setQuery] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  const { fsListing, listingKey, selectedSessionId } = useSelectedSessionFsListing();

  const filtered = useMemo(() => {
    if (selectedSessionId === undefined || listingKey === null) {
      return [];
    }
    return filterFsListingMatches(fsListing.entries, query);
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border p-3">
        <Input
          onChange={event => {
            setQuery(event.target.value);
          }}
          placeholder="Filter paths (fzf)"
          value={query}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {selectedSessionId === undefined
            ? 'No active session'
            : fsListing.status === 'loading'
              ? 'Loading listing…'
              : `${filtered.length} / ${entryCount} entries`}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" ref={parentRef}>
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {selectedSessionId === undefined ? 'Select a session to inspect its @ listing.' : 'No matches'}
          </p>
        ) : (
          <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const match = filtered.at(virtualRow.index);
              if (match == null) {
                return null;
              }
              const { boldFrom, path } = listingPathBoldFrom(match.entry);
              return (
                <div
                  className="absolute right-0 left-0 flex items-center gap-1.5 overflow-hidden px-3"
                  key={virtualRow.key}
                  style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                >
                  <ListingEntryIcon className="size-4" entry={match.entry} />
                  <div className="min-w-0 flex-1 truncate font-mono text-xs leading-9">
                    <HighlightFzfChars boldFrom={boldFrom} positions={match.positions} text={path} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
