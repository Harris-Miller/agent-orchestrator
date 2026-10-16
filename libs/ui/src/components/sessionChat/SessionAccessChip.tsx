import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import type { FC, MouseEvent } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { COMPOSER_MODEL_MENU_MIN_WIDTH } from './composerChromeMenu.ts';
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
      >
        {choiceLabel(option)}
      </ComposerChromeChip>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
        onClose={() => {
          setAnchorEl(null);
        }}
        open={anchorEl !== null}
        slotProps={{ paper: { sx: { minWidth: COMPOSER_MODEL_MENU_MIN_WIDTH } } }}
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
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
