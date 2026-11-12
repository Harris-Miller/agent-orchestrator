import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { COMPOSER_MODEL_MENU_MIN_WIDTH, useComposerChromeMenu } from './composerChromeMenu.ts';
import { configOptionChoiceLabel, selectChoiceViews } from './sessionConfigOptionSelectViews.ts';

/** Chip bound to Config option `mode` (UI label may say Access). */
export const SessionAccessChip: FC<{
  readonly disabled?: boolean;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly option: NormalizedSelectConfigOption;
}> = ({ disabled = false, onChange, option }) => {
  const menu = useComposerChromeMenu();
  const views = selectChoiceViews(option);

  return (
    <>
      <ComposerChromeChip disabled={disabled} onClick={menu.openFromClick}>
        {configOptionChoiceLabel(option)}
      </ComposerChromeChip>
      <Menu {...menu.menuProps} slotProps={{ paper: { sx: { minWidth: COMPOSER_MODEL_MENU_MIN_WIDTH } } }}>
        {views.map(view => (
          <MenuItem
            key={view.id}
            onClick={() => {
              onChange({ configId: option.id, type: 'select', value: view.id });
              menu.close();
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
