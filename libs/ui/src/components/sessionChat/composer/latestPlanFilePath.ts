import type { ChatItem } from '../../../host/sessionUpdateReducer.ts';

/** Path of the most recent Claude plan file in the transcript, if any. */
export const latestPlanFilePath = (items: readonly ChatItem[]): string | undefined =>
  items
    .flatMap(item => (item.kind === 'tool_call' && item.planFilePath !== undefined ? [item.planFilePath] : []))
    .at(-1);
