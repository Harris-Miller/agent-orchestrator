import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { useComposerChromeMenu } from './composerChromeMenu.ts';
import { configOptionChoiceLabel, selectChoiceViews } from './sessionConfigOptionSelectViews.ts';

/** Pill for a select Config option — current value only; Menu for choices. */
export const SessionConfigOptionSelect: FC<{
  readonly disabled: boolean;
  readonly onChange: (configId: string, value: string) => void;
  readonly option: NormalizedSelectConfigOption;
  readonly unavailableModelIds?: readonly string[];
}> = ({ disabled, onChange, option, unavailableModelIds }) => {
  const menu = useComposerChromeMenu();
  const choices = selectChoiceViews(option, unavailableModelIds);

  if (choices.length === 0) {
    return null;
  }

  return (
    <>
      <ComposerChromeChip disabled={disabled} onClick={menu.openFromClick}>
        {configOptionChoiceLabel(option)}
      </ComposerChromeChip>
      <Menu {...menu.menuProps} sx={{ maxWidth: 360 }}>
        {choices.map(choice => (
          <MenuItem
            disabled={choice.disabled}
            key={choice.id}
            onClick={() => {
              onChange(option.id, choice.id);
              menu.close();
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
