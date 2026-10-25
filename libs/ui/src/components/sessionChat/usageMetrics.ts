import type { SessionUsageDocument } from '@lib/ao-home';

export const usagePercent = (usage: SessionUsageDocument): number =>
  usage.size > 0 ? (usage.used / usage.size) * 100 : 0;

/** Classes for a partial usage value. `chart-3` follows the Theme preference; raw amber does not. */
export const usageToneClass = (percent: number): { readonly indicator: string; readonly stroke: string } => {
  if (percent >= 90) {
    return {
      indicator: '[&_[data-slot=progress-indicator]]:bg-destructive',
      stroke: 'stroke-destructive',
    };
  }
  if (percent >= 75) {
    return {
      indicator: '[&_[data-slot=progress-indicator]]:bg-chart-3',
      stroke: 'stroke-chart-3',
    };
  }
  return { indicator: '', stroke: 'stroke-primary' };
};

export const formatUsageCost = (cost: { readonly amount: number; readonly currency: string }): string => {
  try {
    return new Intl.NumberFormat(undefined, { currency: cost.currency, style: 'currency' }).format(cost.amount);
  } catch {
    return `${cost.amount} ${cost.currency}`;
  }
};
