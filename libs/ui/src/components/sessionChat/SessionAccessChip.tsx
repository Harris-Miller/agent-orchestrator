import Check from '@mui/icons-material/Check';
import LockOpen from '@mui/icons-material/LockOpen';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import type { FC, MouseEvent } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { selectChoiceViews } from './sessionConfigOptionSelectViews.ts';

const choiceLabel = (option: NormalizedSelectConfigOption): string => {
  const current = option.currentValue;
  if (current === undefined) {
    return option.name;
  }
  return option.choices.find(choice => choice.id === current)?.name ?? current;
};

/** Access chip bound to Config option `mode`. */
export const SessionAccessChip: FC<{
  readonly disabled?: boolean;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly option: NormalizedSelectConfigOption;
}> = ({ disabled = false, onChange, option }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const views = selectChoiceViews(option);

  return (
    <>
      <ComposerChromeChip
        disabled={disabled}
        onClick={(event: MouseEvent<HTMLElement>) => {
          setAnchorEl(event.currentTarget);
        }}
        tone="warn"
      >
        <LockOpen sx={{ fontSize: 14 }} />
        {choiceLabel(option)}
      </ComposerChromeChip>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
        onClose={() => {
          setAnchorEl(null);
        }}
        open={anchorEl !== null}
        sx={{ maxWidth: 360 }}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        {views.map(view => (
          <MenuItem
            key={view.id}
            onClick={() => {
              onChange({ configId: option.id, type: 'select', value: view.id });
              setAnchorEl(null);
            }}
            selected={option.currentValue === view.id}
            sx={{ alignItems: 'flex-start', whiteSpace: 'normal' }}
          >
            <ListItemText primary={view.label} secondary={view.description} />
            {option.currentValue === view.id ? (
              <ListItemIcon sx={{ minWidth: 28 }}>
                <Check fontSize="small" />
              </ListItemIcon>
            ) : null}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
