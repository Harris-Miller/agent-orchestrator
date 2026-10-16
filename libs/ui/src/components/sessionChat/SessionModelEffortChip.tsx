import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { COMPOSER_MODEL_MENU_MIN_WIDTH, useComposerChromeMenu } from './composerChromeMenu.ts';
import { configOptionChoiceLabel, selectChoiceViews } from './sessionConfigOptionSelectViews.ts';

export const SessionModelEffortChip: FC<{
  readonly disabled?: boolean;
  readonly effort?: NormalizedSelectConfigOption;
  readonly model: NormalizedSelectConfigOption;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly unavailableModelIds?: readonly string[];
}> = ({ disabled = false, effort, model, onChange, unavailableModelIds = [] }) => {
  const menu = useComposerChromeMenu();
  const modelViews = selectChoiceViews(model, unavailableModelIds);
  const effortViews = effort === undefined ? [] : selectChoiceViews(effort);
  const dualColumn = effort !== undefined;

  return (
    <>
      <ComposerChromeChip active={menu.active} disabled={disabled} onClick={menu.openFromClick}>
        <Typography component="span" sx={{ color: 'text.primary', fontSize: 13 }}>
          {configOptionChoiceLabel(model)}
        </Typography>
        {effort !== undefined ? (
          <Typography component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>
            · {configOptionChoiceLabel(effort)}
          </Typography>
        ) : null}
      </ComposerChromeChip>
      <Menu
        {...menu.menuProps}
        slotProps={dualColumn ? { list: { sx: { display: 'flex', flexDirection: 'row', p: 0 } } } : undefined}
      >
        <Box sx={{ minWidth: COMPOSER_MODEL_MENU_MIN_WIDTH, py: 0.5 }}>
          {dualColumn ? (
            <Typography color="text.secondary" sx={{ px: 2, py: 0.5 }} variant="caption">
              Model
            </Typography>
          ) : null}
          <MenuList dense disablePadding>
            {modelViews.map(view => (
              <MenuItem
                disabled={view.disabled}
                key={view.id}
                onClick={() => {
                  onChange({ configId: model.id, type: 'select', value: view.id });
                  if (!dualColumn) {
                    menu.close();
                  }
                }}
                selected={model.currentValue === view.id}
              >
                <ListItemText primary={view.label} secondary={view.description} />
              </MenuItem>
            ))}
          </MenuList>
        </Box>
        {effort !== undefined ? (
          <>
            <Divider flexItem orientation="vertical" />
            <Box sx={{ minWidth: COMPOSER_MODEL_MENU_MIN_WIDTH, py: 0.5 }}>
              <Typography color="text.secondary" sx={{ px: 2, py: 0.5 }} variant="caption">
                Effort
              </Typography>
              <MenuList dense disablePadding>
                {effortViews.map(view => (
                  <MenuItem
                    key={view.id}
                    onClick={() => {
                      onChange({ configId: effort.id, type: 'select', value: view.id });
                    }}
                    selected={effort.currentValue === view.id}
                  >
                    <ListItemText primary={view.label} secondary={view.description} />
                  </MenuItem>
                ))}
              </MenuList>
            </Box>
          </>
        ) : null}
      </Menu>
    </>
  );
};
