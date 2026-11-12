import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { FC, ReactNode } from 'react';

import { FONT_FAMILY_MONO } from '../../../../theme/tokens.ts';

const menuShellSx = {
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
  maxHeight: 320,
  overflow: 'auto',
} as const;

type RowRefRegistry = {
  readonly register: (index: number, node: HTMLElement | null) => void;
};

const ComposerMenuRowRefContext = createContext<null | RowRefRegistry>(null);

export type ComposerMenuShellProps = {
  readonly children: ReactNode;
  readonly focusedIndex: number;
  readonly itemCount: number;
  readonly loading?: boolean;
  readonly open: boolean;
};

export const ComposerMenuShell: FC<ComposerMenuShellProps> = ({
  children,
  focusedIndex,
  itemCount,
  loading = false,
  open,
}) => {
  const rowRefs = useRef(new Map<number, HTMLElement>());
  // Stable registry so Provider value identity does not churn; register closes over rowRefs.
  const registry = useMemo<RowRefRegistry>(
    () => ({
      register: (index, node) => {
        if (node === null) {
          rowRefs.current.delete(index);
          return;
        }
        rowRefs.current.set(index, node);
      },
    }),
    [],
  );

  useLayoutEffect(() => {
    if (!open || itemCount === 0) {
      return;
    }
    rowRefs.current.get(focusedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, itemCount, open]);

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
      ) : itemCount === 0 ? (
        <Typography color="text.secondary" sx={{ px: 1.5, py: 1 }} variant="body2">
          No matches
        </Typography>
      ) : (
        <ComposerMenuRowRefContext.Provider value={registry}>
          <List dense disablePadding>
            {children}
          </List>
        </ComposerMenuRowRefContext.Provider>
      )}
    </Paper>
  );
};

export type ComposerMenuRowProps = {
  readonly index: number;
  readonly onFocusIndexChange: (index: number) => void;
  readonly onSelect: () => void;
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
  readonly selected: boolean;
};

export const ComposerMenuRow: FC<ComposerMenuRowProps> = ({
  index,
  onFocusIndexChange,
  onSelect,
  primary,
  secondary,
  selected,
}) => {
  const registry = useContext(ComposerMenuRowRefContext);
  const hasSecondary = secondary != null && secondary !== false && secondary !== '';

  return (
    <ListItemButton
      onClick={onSelect}
      onMouseEnter={() => {
        onFocusIndexChange(index);
      }}
      ref={node => {
        registry?.register(index, node);
      }}
      selected={selected}
      sx={{ py: 0.75 }}
    >
      <Typography component="div" noWrap sx={{ width: '100%' }} variant="body2">
        <Box component="span" sx={{ fontFamily: FONT_FAMILY_MONO, mr: hasSecondary ? 1 : 0 }}>
          {primary}
        </Box>
        {hasSecondary ? (
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {secondary}
          </Box>
        ) : null}
      </Typography>
    </ListItemButton>
  );
};
