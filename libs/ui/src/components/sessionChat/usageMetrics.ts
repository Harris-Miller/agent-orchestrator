import type { SessionUsageDocument } from '@lib/ao-home';

export const usagePercent = (usage: SessionUsageDocument): number =>
  usage.size > 0 ? (usage.used / usage.size) * 100 : 0;

export const formatUsageCost = (cost: { readonly amount: number; readonly currency: string }): string => {
  try {
    return new Intl.NumberFormat(undefined, { currency: cost.currency, style: 'currency' }).format(cost.amount);
  } catch {
    return `${cost.amount} ${cost.currency}`;
  }
};
