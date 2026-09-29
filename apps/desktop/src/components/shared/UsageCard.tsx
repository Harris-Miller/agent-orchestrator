import type { SessionUsageDocument } from '@lib/ao-home';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

const usageCardSx = {
  bgcolor: 'background.default',
  borderColor: 'divider',
  p: 1.5,
} as const;

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

export const UsageCard: FC<{ readonly usage: SessionUsageDocument }> = ({ usage }) => {
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
