import Check from '@mui/icons-material/Check';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
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
  readonly effort: NormalizedSelectConfigOption;
  readonly model: NormalizedSelectConfigOption;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly unavailableModelIds?: readonly string[];
}> = ({ disabled = false, effort, model, onChange, unavailableModelIds = [] }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const modelViews = selectChoiceViews(model, unavailableModelIds);
  const effortViews = selectChoiceViews(effort);

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
        <Typography component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>
          · {choiceLabel(effort)}
        </Typography>
      </ComposerChromeChip>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
        onClose={() => {
          setAnchorEl(null);
        }}
        open={anchorEl !== null}
        slotProps={{ list: { sx: { display: 'flex', flexDirection: 'row', p: 0 } } }}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        <Box sx={{ minWidth: 148, py: 0.5 }}>
          <Typography color="text.secondary" sx={{ px: 2, py: 0.5 }} variant="caption">
            Model
          </Typography>
          <MenuList dense disablePadding>
            {modelViews.map(view => (
              <MenuItem
                disabled={view.disabled}
                key={view.id}
                onClick={() => {
                  onChange({ configId: model.id, type: 'select', value: view.id });
                }}
                selected={model.currentValue === view.id}
              >
                <ListItemText primary={view.label} secondary={view.description} />
                {model.currentValue === view.id ? (
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <Check fontSize="small" />
                  </ListItemIcon>
                ) : null}
              </MenuItem>
            ))}
          </MenuList>
        </Box>
        <Divider flexItem orientation="vertical" />
        <Box sx={{ minWidth: 148, py: 0.5 }}>
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
                {effort.currentValue === view.id ? (
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <Check fontSize="small" />
                  </ListItemIcon>
                ) : null}
              </MenuItem>
            ))}
          </MenuList>
        </Box>
      </Menu>
    </>
  );
};
