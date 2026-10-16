import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import type { FC, MouseEvent } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { selectChoiceViews } from './sessionConfigOptionSelectViews.ts';

const choiceLabel = (option: NormalizedSelectConfigOption): string => {
  const current = option.currentValue;
  if (current === undefined) {
    return option.name;
  }
  return option.choices.find(choice => choice.id === current)?.name ?? current;
};

/** Pill for a select Config option — current value only; Menu for choices. */
export const SessionConfigOptionSelect: FC<{
  readonly disabled: boolean;
  readonly onChange: (configId: string, value: string) => void;
  readonly option: NormalizedSelectConfigOption;
  readonly unavailableModelIds?: readonly string[];
}> = ({ disabled, onChange, option, unavailableModelIds }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const choices = selectChoiceViews(option, unavailableModelIds);

  if (choices.length === 0) {
    return null;
  }

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
        sx={{ maxWidth: 360 }}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        {choices.map(choice => (
          <MenuItem
            disabled={choice.disabled}
            key={choice.id}
            onClick={() => {
              onChange(option.id, choice.id);
              setAnchorEl(null);
            }}
            selected={option.currentValue === choice.id}
            sx={{ alignItems: 'flex-start', whiteSpace: 'normal' }}
          >
            <ListItemText primary={choice.label} secondary={choice.description} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
