import Divider from '@mui/material/Divider';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import { CheckedMenuItem } from './CheckedMenuItem.tsx';

/** The Reasoning section of the right pane: one checked row per effort choice. */
export const ReasoningList: FC<{
  readonly effort: NormalizedSelectConfigOption;
  readonly onChange: (diff: ConfigValueDiff) => void;
}> = ({ effort, onChange }) => (
  <>
    <Typography color="text.secondary" sx={{ display: 'block', px: 2, py: 1.25 }} variant="caption">
      Reasoning
    </Typography>
    <MenuList dense sx={{ p: 1, pt: 0 }}>
      {effort.choices.map(choice => (
        <CheckedMenuItem
          key={choice.id}
          label={choice.name}
          onSelect={() => {
            onChange({ configId: effort.id, type: 'select', value: choice.id });
          }}
          selected={effort.currentValue === choice.id}
        />
      ))}
    </MenuList>
    <Divider />
  </>
);
