import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputBase from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { agentLaunchTargetLabel } from '../../../host/agentLaunchTarget.ts';
import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';

import { searchModelRows, splitModelRows } from './modelPickerList.ts';
import type { ModelRow } from './modelPickerList.ts';

/** Left pane: search box, models by name only, Hidden models behind "Show more". */
export const ModelPickerList: FC<{
  readonly currentId: string | undefined;
  readonly onHover: (row: ModelRow | undefined) => void;
  readonly onPick: (row: ModelRow) => void;
  readonly rows: readonly ModelRow[];
  /** Rows searched instead of `rows` while a query is typed (each with a provider badge), e.g. across Virtual launch targets. */
  readonly searchRows?: () => readonly ModelRow[];
  readonly searchPlaceholder: string;
}> = ({ currentId, onHover, onPick, rows, searchPlaceholder, searchRows }) => {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const searching = query.trim() !== '';
  const crossProvider = searchRows !== undefined;

  const row = (model: ModelRow, badge: boolean) => (
    <MenuItem
      disabled={model.disabled}
      key={`${model.launchTarget ?? ''}:${model.id}`}
      onClick={() => {
        onPick(model);
      }}
      onMouseEnter={() => {
        onHover(model);
      }}
      onMouseLeave={() => {
        onHover(undefined);
      }}
      selected={model.id === currentId && !badge}
      sx={{ borderRadius: 1, gap: 1, opacity: model.hidden ? 0.75 : 1 }}
    >
      <Typography sx={{ flex: 1, fontSize: 14 }}>{model.label}</Typography>
      {badge && model.launchTarget !== undefined ? (
        <Typography color="text.secondary" sx={{ fontSize: 11 }}>
          {agentLaunchTargetLabel(model.launchTarget)}
        </Typography>
      ) : null}
      {model.id === currentId && !badge ? <LucideMuiIcon icon={Check} sx={{ fontSize: 16 }} /> : null}
    </MenuItem>
  );

  const { hidden, shown } = splitModelRows(rows);
  const hits = searching ? searchModelRows(searchRows?.() ?? rows, query) : [];

  return (
    <Box sx={{ minWidth: 0 }}>
      <InputBase
        autoFocus
        inputProps={{ 'aria-label': 'Search models' }}
        onChange={event => {
          setQuery(event.target.value);
        }}
        placeholder={searchPlaceholder}
        sx={{ borderBottom: 1, borderColor: 'divider', fontSize: 14, px: 2, py: 1, width: '100%' }}
        value={query}
      />
      <MenuList dense sx={{ maxHeight: 300, overflowY: 'auto', p: 1 }}>
        {searching ? (
          hits.length === 0 ? (
            <Typography color="text.secondary" sx={{ fontSize: 13, px: 1, py: 1 }}>
              No models match
            </Typography>
          ) : (
            hits.map(model => row(model, crossProvider))
          )
        ) : (
          <>
            {shown.map(model => row(model, false))}
            {hidden.length > 0 ? (
              <Button
                color="inherit"
                endIcon={<LucideMuiIcon icon={expanded ? ChevronUp : ChevronDown} sx={{ fontSize: 16 }} />}
                fullWidth
                onClick={() => {
                  setExpanded(!expanded);
                }}
                size="small"
                sx={{ color: 'text.secondary', justifyContent: 'flex-start', textTransform: 'none' }}
              >
                {expanded ? 'Hide more' : `Show more (${hidden.length})`}
              </Button>
            ) : null}
            {expanded ? hidden.map(model => row(model, false)) : null}
          </>
        )}
      </MenuList>
    </Box>
  );
};
