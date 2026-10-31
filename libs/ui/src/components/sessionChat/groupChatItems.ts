import type { ChatItem } from '../../host/sessionUpdateReducer.ts';

export type WorkRegion = {
  readonly id: string;
  readonly isLastTurn: boolean;
  readonly items: readonly ChatItem[];
  readonly kind: 'work_region';
  readonly turn?: Extract<ChatItem, { kind: 'user_message' }>;
};

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
      const lastWork = body.findLastIndex(isWork);
      if (lastWork === -1) {
        out.push(...body);
      } else {
        out.push({
          id: body.find(isWork)!.id,
          isLastTurn: i - 1 === lastTurnStart,
          items: body.slice(0, lastWork + 1),
          kind: 'work_region',
          turn: head,
        });
        out.push(...body.slice(lastWork + 1));
      }
      i = end;
    }
  }
  return out;
};

export const workRegionLabel = (region: WorkRegion, inFlight: boolean, unstampedLabel = 'Worked'): string => {
  if (inFlight) return 'Working…';
  const { endedAt, startedAt } = region.turn ?? {};
  return startedAt !== undefined && endedAt !== undefined
    ? `Worked for ${String(Math.round((endedAt - startedAt) / 1000))}s`
    : unstampedLabel;
};
