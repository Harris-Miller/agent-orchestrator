import type { WorkRegion } from './groupChatItems.ts';

const durationFormat = new Intl.DurationFormat('en', { style: 'narrow' });

/** `141` → `2m 21s`. */
export const formatSeconds = (totalSeconds: number): string => {
  const total = Math.max(0, totalSeconds);
  return (
    durationFormat.format({
      hours: Math.floor(total / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
    }) || '0s'
  );
};

/** `now` (epoch ms) only matters while in flight: the label counts up from the turn's `startedAt`. */
export const workRegionLabel = (region: WorkRegion, inFlight: boolean, now: number, unstampedLabel: string): string => {
  const { endedAt, startedAt } = region.userMessage;
  if (inFlight) {
    return startedAt === undefined ? 'Working…' : `Working for ${formatSeconds(Math.floor((now - startedAt) / 1000))}`;
  }
  return startedAt !== undefined && endedAt !== undefined
    ? `Worked for ${formatSeconds(Math.round((endedAt - startedAt) / 1000))}`
    : unstampedLabel;
};
