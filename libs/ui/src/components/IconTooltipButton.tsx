import IconButton from '@mui/material/IconButton';
import type { SxProps, Theme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import type { LucideIcon } from 'lucide-react';
import type { FC } from 'react';

import { LucideMuiIcon } from './LucideMuiIcon.tsx';

/** Small icon-only button whose `label` is both its aria-label and tooltip. */
export const IconTooltipButton: FC<{
  readonly disabled?: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onClick: () => void;
  readonly sx?: SxProps<Theme>;
}> = ({ disabled, icon, label, onClick, sx }) => (
  <Tooltip title={label}>
    {/* span lets the tooltip work while the button is disabled */}
    <span>
      <IconButton aria-label={label} disabled={disabled} onClick={onClick} size="small" sx={sx}>
        <LucideMuiIcon fontSize="small" icon={icon} />
      </IconButton>
    </span>
  </Tooltip>
);
