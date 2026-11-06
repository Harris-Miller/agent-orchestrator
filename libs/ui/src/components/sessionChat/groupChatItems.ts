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

/** The region a running prompt is still adding to: last region of the last turn. */
export const isLiveRegion = (region: WorkRegion): boolean => region.isLastTurn && region.isLastInTurn;

const isWork = (item: ChatItem) =>
  item.kind === 'tool_call' || item.kind === 'plan' || item.kind === 'agent_thought' || item.kind === 'subagent';

/** Cut a turn body into runs separated by (and including, as singleton runs) Elicitation summaries. */
const splitAtSummaries = (body: readonly ChatItem[]): readonly (readonly ChatItem[])[] =>
  body.reduce<ChatItem[][]>(
    (runs, item) => {
      if (item.kind === 'elicitation_summary') return [...runs, [item], []];
      runs.at(-1)!.push(item);
      return runs;
    },
    [[]],
  );

const groupTurn = (
  userMessage: WorkRegion['userMessage'],
  body: readonly ChatItem[],
  isLastTurn: boolean,
): readonly (ChatItem | WorkRegion)[] => {
  const runs = splitAtSummaries(body);
  const lastWorkRun = runs.findLastIndex(run => run.some(isWork));
  return runs.flatMap<ChatItem | WorkRegion>((run, index) => {
    const lastWork = run.findLastIndex(isWork);
    if (lastWork === -1) return run;
    const region: WorkRegion = {
      id: run.find(isWork)!.id,
      isLastInTurn: index === lastWorkRun,
      isLastTurn,
      items: run.slice(0, lastWork + 1),
      kind: 'work_region',
      userMessage,
    };
    return [region, ...run.slice(lastWork + 1)];
  });
};

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
      out.push(...groupTurn(head, items.slice(i, end), i - 1 === lastTurnStart));
      i = end;
    }
  }
  return out;
};
