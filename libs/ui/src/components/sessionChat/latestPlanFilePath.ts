import type { ChatItem } from '../../host/sessionUpdateReducer.ts';

/** Path of the most recent Claude plan file in the transcript, if any. */
export const latestPlanFilePath = (items: readonly ChatItem[]): string | undefined => {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item.kind === 'tool_call' && item.planFilePath !== undefined) return item.planFilePath;
  }
  return undefined;
};
