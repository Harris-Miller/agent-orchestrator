import type { SessionUsage } from '../../host/sessionUsage.ts';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import { useState } from 'react';
import type { FC } from 'react';

import { UsageCard } from './UsageCard.tsx';
import { usageBarColor, usagePercent } from './usageMetrics.ts';

const USAGE_POPOVER_ID = 'session-usage-popover';

export const UsagePopover: FC<{ readonly usage?: SessionUsage }> = ({ usage }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchorEl);

  if (usage === undefined) {
    return null;
  }

  const percent = usagePercent(usage);

  return (
    <>
      <IconButton
        aria-describedby={open ? USAGE_POPOVER_ID : undefined}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Session usage"
        onClick={event => {
          setAnchorEl(event.currentTarget);
        }}
        size="small"
        type="button"
      >
        <Box sx={{ display: 'inline-flex', position: 'relative' }}>
          <CircularProgress
            aria-hidden
            color={usageBarColor(percent)}
            enableTrackSlot
            size={18}
            value={percent}
            variant="determinate"
          />
        </Box>
      </IconButton>
      <Popover
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: 'center', vertical: 'top' }}
        id={USAGE_POPOVER_ID}
        onClose={() => {
          setAnchorEl(null);
        }}
        open={open}
        transformOrigin={{ horizontal: 'center', vertical: 'bottom' }}
      >
        <UsageCard usage={usage} />
      </Popover>
    </>
  );
};
