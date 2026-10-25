/** Composer `@` filesystem mention menu — virtualized over the full fzf result set. */
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef } from 'react';
import type { FC } from 'react';

import type { FdListingEntry } from '../../host/fdListing.ts';
import { listingPathBoldFrom } from '../../host/fdListing.ts';
import { HighlightFzfChars } from '../HighlightFzfChars.tsx';

import { composerMenuPanelClass, ComposerMenuPlaceholder, ComposerMenuRow } from './ComposerMenuShell.tsx';
import { ListingEntryIcon } from './FileChipIconView.tsx';
import type { FsListingMatch } from './filterFsListingEntries.ts';

const MENU_MAX_HEIGHT_PX = 320;
const ROW_ESTIMATE_PX = 40;

export type ComposerMentionMenuProps = {
  readonly focusedIndex: number;
  readonly loading: boolean;
  readonly matches: readonly FsListingMatch[];
  readonly onFocusIndexChange: (index: number) => void;
  readonly onSelect: (entry: FdListingEntry) => void;
  readonly open: boolean;
};

export const ComposerMentionMenu: FC<ComposerMentionMenuProps> = ({
  focusedIndex,
  loading,
  matches,
  onFocusIndexChange,
  onSelect,
  open,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // TanStack Virtual returns non-memoizable helpers; React Compiler skips this call site.
  // eslint-disable-next-line react-hooks/incompatible-library -- useVirtualizer API
  const rowVirtualizer = useVirtualizer({
    count: matches.length,
    estimateSize: () => ROW_ESTIMATE_PX,
    getItemKey: index => {
      const match = matches.at(index);
      return match == null ? index : `${match.entry.kind}:${match.entry.path}`;
    },
    getScrollElement: () => parentRef.current,
    overscan: 8,
    useFlushSync: false,
  });

  useLayoutEffect(() => {
    if (!open || matches.length === 0) {
      return;
    }
    rowVirtualizer.scrollToIndex(focusedIndex, { align: 'auto' });
  }, [focusedIndex, matches.length, open, rowVirtualizer]);

  if (!open) {
    return null;
  }

  return (
    <div className={composerMenuPanelClass} ref={parentRef} style={{ maxHeight: MENU_MAX_HEIGHT_PX }}>
      {loading || matches.length === 0 ? (
        <ComposerMenuPlaceholder loading={loading} />
      ) : (
        <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const match = matches.at(virtualRow.index);
            if (match == null) {
              return null;
            }
            const { boldFrom, path } = listingPathBoldFrom(match.entry);
            return (
              <div
                data-index={virtualRow.index}
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                style={{
                  left: 0,
                  position: 'absolute',
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  width: '100%',
                }}
              >
                <ComposerMenuRow
                  index={virtualRow.index}
                  onFocusIndexChange={onFocusIndexChange}
                  onSelect={() => {
                    onSelect(match.entry);
                  }}
                  primary={
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <ListingEntryIcon className="size-4" entry={match.entry} />
                      <span className="min-w-0 truncate">
                        <HighlightFzfChars boldFrom={boldFrom} positions={match.positions} text={path} />
                      </span>
                    </span>
                  }
                  selected={virtualRow.index === focusedIndex}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
