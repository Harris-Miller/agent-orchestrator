import type { SessionUsageDocument } from '@lib/ao-home';
import type { FC } from 'react';

import { Button } from '../ui/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx';

import { UsageCard } from './UsageCard.tsx';
import { usagePercent } from './usageMetrics.ts';

const UsageRing: FC<{ readonly percent: number }> = ({ percent }) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const stroke = percent >= 90 ? 'stroke-destructive' : percent >= 75 ? 'stroke-amber-500' : 'stroke-primary';

  return (
    <svg aria-hidden className="size-[18px]" viewBox="0 0 18 18">
      <circle className="stroke-muted" cx="9" cy="9" fill="none" r={radius} strokeWidth="2" />
      <circle
        className={stroke}
        cx="9"
        cy="9"
        fill="none"
        r={radius}
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        strokeWidth="2"
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
};

export const UsagePopover: FC<{ readonly usage?: SessionUsageDocument }> = ({ usage }) => {
  if (usage === undefined) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger aria-label="Session usage" render={<Button size="icon-sm" type="button" variant="ghost" />}>
        <UsageRing percent={usagePercent(usage)} />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" side="top">
        <UsageCard usage={usage} />
      </PopoverContent>
    </Popover>
  );
};
