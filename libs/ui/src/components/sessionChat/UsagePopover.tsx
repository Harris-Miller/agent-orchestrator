import type { SessionUsageDocument } from '@lib/ao-home';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC } from 'react';

const usageCardSx = {
  bgcolor: 'background.default',
  borderColor: 'divider',
  p: 1.5,
} as const;

const USAGE_POPOVER_ID = 'session-usage-popover';

const usagePercent = (usage: SessionUsageDocument): number => (usage.size > 0 ? (usage.used / usage.size) * 100 : 0);

const usageBarColor = (percent: number): 'error' | 'success' | 'warning' => {
  if (percent >= 90) {
    return 'error';
  }
  if (percent >= 75) {
    return 'warning';
  }
  return 'success';
};

const formatCost = (cost: { readonly amount: number; readonly currency: string }): string => {
  try {
    return new Intl.NumberFormat(undefined, { currency: cost.currency, style: 'currency' }).format(cost.amount);
  } catch {
    return `${cost.amount} ${cost.currency}`;
  }
};

const UsageCard: FC<{ readonly usage: SessionUsageDocument }> = ({ usage }) => {
  const percent = usagePercent(usage);
  const remaining = Math.max(0, usage.size - usage.used);

  return (
    <Paper sx={usageCardSx} variant="outlined">
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            Context
          </Typography>
          <Typography variant="body2">{percent.toFixed(1)}%</Typography>
        </Stack>
        <LinearProgress
          aria-label="Context window usage"
          aria-valuetext={`${usage.used.toLocaleString()} of ${usage.size.toLocaleString()} tokens`}
          color={usageBarColor(percent)}
          max={usage.size}
          min={0}
          value={usage.used}
          variant="determinate"
        />
        <Typography color="text.secondary" variant="caption">
          {`${usage.used.toLocaleString()} used · ${remaining.toLocaleString()} remaining · ${usage.size.toLocaleString()} window`}
        </Typography>
        {usage.cost !== undefined ? (
          <Typography variant="body2">
            Cost: <strong>{formatCost(usage.cost)}</strong>
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
};

export const UsagePopover: FC<{ readonly usage?: SessionUsageDocument }> = ({ usage }) => {
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
