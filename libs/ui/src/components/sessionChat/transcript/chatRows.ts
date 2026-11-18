import type { ChatItem } from '../../../host/sessionUpdateReducer.ts';
import type { WorkRegion } from './workRegion/groupChatItems.ts';

/** Stable virtual row key for a grouped chat entry; Work regions are prefixed so they never collide with an item id. */
export const chatRowKey = (item: ChatItem | WorkRegion): string =>
  item.kind === 'work_region' ? `work-${item.id}` : item.id;

/** Rendered row indexes plus the always-mounted indexes (open Work regions keep local state), sorted and unique. */
export const withKeptRows = (rendered: readonly number[], kept: readonly number[]): number[] =>
  [...new Set([...rendered, ...kept])].toSorted((a, b) => a - b);
