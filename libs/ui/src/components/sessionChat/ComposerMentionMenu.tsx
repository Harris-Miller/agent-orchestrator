/** Composer `@` filesystem mention menu — virtualized over the full fzf result set. */
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef } from 'react';
import type { FC } from 'react';

import type { FdListingEntry } from '../../host/fdListing.ts';
import { listingBasename } from '../../host/fdListing.ts';

import { ComposerMenuRow } from './ComposerMenuShell.tsx';

const MENU_MAX_HEIGHT_PX = 320;
const ROW_ESTIMATE_PX = 40;

export type ComposerMentionMenuProps = {
  readonly entries: readonly FdListingEntry[];
  readonly focusedIndex: number;
  readonly loading: boolean;
  readonly onFocusIndexChange: (index: number) => void;
  readonly onSelect: (entry: FdListingEntry) => void;
  readonly open: boolean;
};

export const ComposerMentionMenu: FC<ComposerMentionMenuProps> = ({
  entries,
  focusedIndex,
  loading,
  onFocusIndexChange,
  onSelect,
  open,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // TanStack Virtual returns non-memoizable helpers; React Compiler skips this call site.
  // eslint-disable-next-line react-hooks/incompatible-library -- useVirtualizer API
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    estimateSize: () => ROW_ESTIMATE_PX,
    getItemKey: index => {
      const entry = entries.at(index);
      return entry == null ? index : `${entry.kind}:${entry.path}`;
    },
    getScrollElement: () => parentRef.current,
    overscan: 8,
    useFlushSync: false,
  });

  useLayoutEffect(() => {
    if (!open || entries.length === 0) {
      return;
    }
    rowVirtualizer.scrollToIndex(focusedIndex, { align: 'auto' });
  }, [entries.length, focusedIndex, open, rowVirtualizer]);

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
      ) : entries.length === 0 ? (
        <Typography color="text.secondary" sx={{ px: 1.5, py: 1 }} variant="body2">
          No matches
        </Typography>
      ) : (
        <List dense disablePadding sx={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const entry = entries.at(virtualRow.index);
            if (entry == null) {
              return null;
            }
            const name = listingBasename(entry.path);
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
                    onSelect(entry);
                  }}
                  primary={entry.kind === 'dir' ? `${name}/` : name}
                  secondary={entry.path}
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
