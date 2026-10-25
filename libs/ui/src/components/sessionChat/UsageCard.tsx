import type { SessionUsageDocument } from '@lib/ao-home';
import type { FC } from 'react';

import { Progress } from '../ui/progress.tsx';

import { formatUsageCost, usagePercent } from './usageMetrics.ts';

const indicatorClass = (percent: number): string => {
  if (percent >= 90) {
    return '[&_[data-slot=progress-indicator]]:bg-destructive';
  }
  if (percent >= 75) {
    return '[&_[data-slot=progress-indicator]]:bg-amber-500';
  }
  return '';
};

export const UsageCard: FC<{ readonly usage: SessionUsageDocument }> = ({ usage }) => {
  const percent = usagePercent(usage);
  const remaining = Math.max(0, usage.size - usage.used);

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Context</p>
          <p className="text-sm">{percent.toFixed(1)}%</p>
        </div>
        <Progress
          aria-label="Context window usage"
          aria-valuetext={`${usage.used.toLocaleString()} of ${usage.size.toLocaleString()} tokens`}
          className={indicatorClass(percent)}
          max={usage.size}
          value={usage.used}
        />
        <p className="text-xs text-muted-foreground">
          {`${usage.used.toLocaleString()} used · ${remaining.toLocaleString()} remaining · ${usage.size.toLocaleString()} window`}
        </p>
        {usage.cost !== undefined ? (
          <p className="text-sm">
            Cost: <strong>{formatUsageCost(usage.cost)}</strong>
          </p>
        ) : null}
      </div>
    </div>
  );
};
