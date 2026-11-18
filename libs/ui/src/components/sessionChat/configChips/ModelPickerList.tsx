import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputBase from '@mui/material/InputBase';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';

import { CheckedMenuItem } from './CheckedMenuItem.tsx';
import { searchModelRows, splitModelRows } from './modelPickerList.ts';
import type { ModelRow } from './modelPickerList.ts';

/** Left pane: search box, models by name only, Hidden models behind "Show more". */
export const ModelPickerList: FC<{
  readonly currentId: string | undefined;
  readonly onHover: (row: ModelRow | undefined) => void;
  readonly onPick: (row: ModelRow) => void;
  readonly rows: readonly ModelRow[];
  /** The list scrolls past this height instead of growing the popover. */
  readonly maxHeight: number;
  readonly searchPlaceholder: string;
}> = ({ currentId, maxHeight, onHover, onPick, rows, searchPlaceholder }) => {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const searching = query.trim() !== '';

  // Rows unmount without `mouseleave` (search, collapse, popover close), so drop the hovered description explicitly.
  useEffect(
    () => () => {
      onHover(undefined);
    },
    [onHover],
  );

  const row = (model: ModelRow) => (
    <CheckedMenuItem
      key={`${model.launchTarget ?? ''}:${model.id}`}
      label={model.label}
      onBlur={() => {
        onHover(undefined);
      }}
      onFocus={() => {
        onHover(model);
      }}
      onMouseEnter={() => {
        onHover(model);
      }}
      onMouseLeave={() => {
        onHover(undefined);
      }}
      onSelect={() => {
        onPick(model);
      }}
      opacity={model.hidden ? 0.75 : 1}
      selected={model.id === currentId}
      unavailable={model.disabled}
    />
  );

  const { hidden, shown } = splitModelRows(rows);
  const hits = searching ? searchModelRows(rows, query) : [];

  return (
    <Box sx={{ minWidth: 0 }}>
      <InputBase
        autoFocus
        inputProps={{ 'aria-label': 'Search models' }}
        onChange={event => {
          setQuery(event.target.value);
          onHover(undefined);
        }}
        placeholder={searchPlaceholder}
        sx={{ borderBottom: 1, borderColor: 'divider', fontSize: 14, px: 2, py: 1, width: '100%' }}
        value={query}
      />
      <MenuList dense sx={{ maxHeight: { sm: maxHeight, xs: 300 }, overflowY: 'auto', p: 1 }}>
        {searching ? (
          hits.length === 0 ? (
            <Typography color="text.secondary" sx={{ fontSize: 13, px: 1, py: 1 }}>
              No models match
            </Typography>
          ) : (
            hits.map(model => row(model))
          )
        ) : (
          <>
            {shown.map(model => row(model))}
            {hidden.length > 0 ? (
              <Button
                color="inherit"
                endIcon={<LucideMuiIcon icon={expanded ? ChevronUp : ChevronDown} sx={{ fontSize: 16 }} />}
                fullWidth
                onClick={() => {
                  setExpanded(!expanded);
                  onHover(undefined);
                }}
                size="small"
                sx={{ color: 'text.secondary', justifyContent: 'flex-start', textTransform: 'none' }}
              >
                {expanded ? 'Hide more' : `Show more (${hidden.length})`}
              </Button>
            ) : null}
            {expanded ? hidden.map(model => row(model)) : null}
          </>
        )}
      </MenuList>
    </Box>
  );
};
