import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
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

export const SessionModelEffortChip: FC<{
  readonly disabled?: boolean;
  readonly effort?: NormalizedSelectConfigOption;
  readonly model: NormalizedSelectConfigOption;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly unavailableModelIds?: readonly string[];
}> = ({ disabled = false, effort, model, onChange, unavailableModelIds = [] }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const modelViews = selectChoiceViews(model, unavailableModelIds);
  const effortViews = effort === undefined ? [] : selectChoiceViews(effort);
  const dualColumn = effort !== undefined;

  return (
    <>
      <ComposerChromeChip
        active={anchorEl !== null}
        disabled={disabled}
        onClick={(event: MouseEvent<HTMLElement>) => {
          setAnchorEl(event.currentTarget);
        }}
      >
        <Typography component="span" sx={{ color: 'text.primary', fontSize: 13 }}>
          {choiceLabel(model)}
        </Typography>
        {effort !== undefined ? (
          <Typography component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>
            · {choiceLabel(effort)}
          </Typography>
        ) : null}
      </ComposerChromeChip>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
        onClose={() => {
          setAnchorEl(null);
        }}
        open={anchorEl !== null}
        slotProps={dualColumn ? { list: { sx: { display: 'flex', flexDirection: 'row', p: 0 } } } : undefined}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
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
                    setAnchorEl(null);
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
