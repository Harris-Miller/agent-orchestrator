import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useLayoutEffect, useRef } from 'react';
import type { FC } from 'react';

import type { FdListingEntry } from '../../host/fdListing.ts';
import { listingBasename } from '../../host/fdListing.ts';

export type ComposerMentionMenuProps = {
  readonly entries: readonly FdListingEntry[];
  readonly focusedIndex: number;
  readonly loading: boolean;
  readonly onFocusIndexChange: (index: number) => void;
  readonly onSelect: (entry: FdListingEntry) => void;
  readonly open: boolean;
};

const menuShellSx = {
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
  maxHeight: 320,
  overflow: 'auto',
} as const;

export const ComposerMentionMenu: FC<ComposerMentionMenuProps> = ({
  entries,
  focusedIndex,
  loading,
  onFocusIndexChange,
  onSelect,
  open,
}) => {
  const rowRefs = useRef(new Map<number, HTMLElement>());

  useLayoutEffect(() => {
    if (!open || entries.length === 0) {
      return;
    }
    rowRefs.current.get(focusedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [entries.length, focusedIndex, open]);

  if (!open) {
    return null;
  }

  return (
    <Paper elevation={8} sx={menuShellSx}>
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
        <List dense disablePadding>
          {entries.map((entry, index) => {
            const name = listingBasename(entry.path);
            return (
              <ListItemButton
                key={`${entry.kind}:${entry.path}`}
                onClick={() => {
                  onSelect(entry);
                }}
                onMouseEnter={() => {
                  onFocusIndexChange(index);
                }}
                ref={node => {
                  if (node === null) {
                    rowRefs.current.delete(index);
                    return;
                  }
                  rowRefs.current.set(index, node);
                }}
                selected={index === focusedIndex}
                sx={{ py: 0.75 }}
              >
                <Typography component="div" noWrap sx={{ width: '100%' }} variant="body2">
                  <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700, mr: 1 }}>
                    {entry.kind === 'dir' ? `${name}/` : name}
                  </Box>
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {entry.path}
                  </Box>
                </Typography>
              </ListItemButton>
            );
          })}
        </List>
      )}
    </Paper>
  );
};
