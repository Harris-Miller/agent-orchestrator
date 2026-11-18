import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { ListChecks } from 'lucide-react';
import type { FC } from 'react';

import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

/** Session History header toggle for Bulk select. */
export const BulkSelectToggle: FC<{
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}> = ({ active, disabled = false, onToggle }) => (
  <Tooltip title={active ? 'Exit selection' : 'Select sessions'}>
    <IconButton
      aria-label="Select sessions"
      aria-pressed={active}
      disabled={disabled}
      color={active ? 'primary' : 'default'}
      onClick={onToggle}
      size="small"
      sx={active ? { bgcolor: 'action.selected' } : undefined}
    >
      <LucideMuiIcon fontSize="small" icon={ListChecks} />
    </IconButton>
  </Tooltip>
);
