import type { ChatItem } from '../../host/sessionUpdateReducer.ts';

export type WorkRegion = {
  readonly id: string;
  readonly isLastTurn: boolean;
  /** Last region of its turn: only this one carries the timed label and auto-opens. */
  readonly isLastInTurn: boolean;
  readonly items: readonly ChatItem[];
  readonly kind: 'work_region';
  readonly userMessage: Extract<ChatItem, { kind: 'user_message' }>;
};

const isSummary = (item: ChatItem) => item.kind === 'elicitation_summary';

const isWork = (item: ChatItem) => item.kind === 'tool_call' || item.kind === 'plan' || item.kind === 'agent_thought';

/** Wrap each turn's items up to its last work item in a WorkRegion; the rest stays flat. */
export const groupChatItems = (items: readonly ChatItem[]): readonly (ChatItem | WorkRegion)[] => {
  const out: (ChatItem | WorkRegion)[] = [];
  const lastTurnStart = items.findLastIndex(item => item.kind === 'user_message');
  let i = 0;
  while (i < items.length) {
    const head = items[i];
    out.push(head);
    i += 1;
    if (head.kind === 'user_message') {
      let end = i;
      while (end < items.length && items[end].kind !== 'user_message') end += 1;
      const body = items.slice(i, end);
      const isLastTurn = i - 1 === lastTurnStart;
      const regions: (ChatItem | WorkRegion)[] = [];
      // Split on summaries; each segment's items up to its last work item form a region.
      let segStart = 0;
      const flush = (segEnd: number) => {
        const seg = body.slice(segStart, segEnd);
        const lastWork = seg.findLastIndex(isWork);
        if (lastWork === -1) {
          regions.push(...seg);
        } else {
          regions.push({
            id: seg.find(isWork)!.id,
            isLastInTurn: false,
            isLastTurn,
            items: seg.slice(0, lastWork + 1),
            kind: 'work_region',
            userMessage: head,
          });
          regions.push(...seg.slice(lastWork + 1));
        }
      };
      body.forEach((item, idx) => {
        if (isSummary(item)) {
          flush(idx);
          regions.push(item);
          segStart = idx + 1;
        }
      });
      flush(body.length);
      const lastRegion = regions.findLastIndex(r => r.kind === 'work_region');
      if (lastRegion !== -1) regions[lastRegion] = { ...(regions[lastRegion] as WorkRegion), isLastInTurn: true };
      out.push(...regions);
      i = end;
    }
  }
  return out;
};
