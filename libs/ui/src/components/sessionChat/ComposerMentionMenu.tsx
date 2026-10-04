/** Composer `@` filesystem mention menu — virtualized over the full fzf result set. */
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef } from 'react';
import type { FC } from 'react';

import { listingBasename } from '../../host/fdListing.ts';
import type { FdListingEntry } from '../../host/fdListing.ts';
import { HighlightFzfChars } from '../HighlightFzfChars.tsx';

import { ComposerMenuRow } from './ComposerMenuShell.tsx';
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
    <Paper
      elevation={8}
      ref={parentRef}
      sx={{
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        maxHeight: MENU_MAX_HEIGHT_PX,
        overflow: 'auto',
      }}
    >
      {loading ? (
        <Box sx={{ px: 1.5, py: 1 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton height={28} key={index} sx={{ mb: 0.5 }} variant="rounded" />
          ))}
        </Box>
      ) : matches.length === 0 ? (
        <Typography color="text.secondary" sx={{ px: 1.5, py: 1 }} variant="body2">
          No matches
        </Typography>
      ) : (
        <List dense disablePadding sx={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const match = matches.at(virtualRow.index);
            if (match == null) {
              return null;
            }
            const path = match.entry.path.normalize();
            const name = listingBasename(path);
            const boldTail = match.entry.kind === 'dir' ? `${name}/` : name;
            const boldFrom = Math.max(0, path.length - boldTail.length);
            return (
              <Box
                data-index={virtualRow.index}
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                sx={{
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
                  primary={<HighlightFzfChars boldFrom={boldFrom} positions={match.positions} text={path} />}
                  selected={virtualRow.index === focusedIndex}
                />
              </Box>
            );
          })}
        </List>
      )}
    </Paper>
  );
};
