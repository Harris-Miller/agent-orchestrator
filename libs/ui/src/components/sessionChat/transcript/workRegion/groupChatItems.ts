import type { ChatItem } from '../../../../host/sessionUpdateReducer.ts';

export type WorkRegion = {
  readonly id: string;
  readonly isLastTurn: boolean;
  /** Last region of its turn: only this one carries the timed label. */
  readonly isLastInTurn: boolean;
  readonly items: readonly ChatItem[];
  readonly kind: 'work_region';
  readonly userMessage: Extract<ChatItem, { kind: 'user_message' }>;
};

/** The region a running prompt is still adding to: last region of the last turn. */
export const isLiveRegion = (region: WorkRegion): boolean => region.isLastTurn && region.isLastInTurn;

type WorkItem = Extract<ChatItem, { kind: 'agent_thought' | 'plan' | 'subagent' | 'tool_call' }>;

const isWork = (item: ChatItem): item is WorkItem =>
  item.kind === 'tool_call' || item.kind === 'plan' || item.kind === 'agent_thought' || item.kind === 'subagent';

type SegmentItem = Exclude<WorkItem, { kind: 'subagent' }>;

const isSegmentItem = (item: ChatItem): item is SegmentItem => isWork(item) && item.kind !== 'subagent';

/** Consecutive Work items of a region between dividers; `id` is its first item's. */
export type WorkSegment = {
  readonly id: string;
  readonly items: readonly SegmentItem[];
  readonly kind: 'work_segment';
};

/** Interim agent messages, subagents and any other non-Work item split a region and render on their own. */
type SegmentDivider = Exclude<ChatItem, SegmentItem>;

/** Split a region's items into Work segments, with dividers between them. */
export const splitWorkSegments = (items: readonly ChatItem[]): readonly (SegmentDivider | WorkSegment)[] =>
  items.reduce<(SegmentDivider | WorkSegment)[]>((out, item) => {
    if (!isSegmentItem(item)) return [...out, item];
    const last = out.at(-1);
    if (last?.kind === 'work_segment') return [...out.slice(0, -1), { ...last, items: [...last.items, item] }];
    return [...out, { id: item.id, items: [item], kind: 'work_segment' }];
  }, []);

const SEGMENT_KIND_NOUNS: readonly (readonly [SegmentItem['kind'], string])[] = [
  ['tool_call', 'tool call'],
  ['agent_thought', 'thought'],
  ['plan', 'plan'],
];

/** Per-kind Work item counts, e.g. `3 tool calls, 1 thought`; zero counts left out. */
export const workSegmentLabel = (segment: WorkSegment): string =>
  SEGMENT_KIND_NOUNS.flatMap(([kind, noun]) => {
    const count = segment.items.filter(item => item.kind === kind).length;
    return count === 0 ? [] : [`${String(count)} ${noun}${count === 1 ? '' : 's'}`];
  }).join(', ');

/** One-line preview of an agent thought (first non-empty line, markdown marks stripped) or plan (progress). */
export const workItemPreviewText = (item: Extract<ChatItem, { kind: 'agent_thought' | 'plan' }>): string =>
  item.kind === 'plan'
    ? `Plan · ${String(item.entries.filter(entry => entry.status === 'completed').length)}/${String(item.entries.length)} completed`
    : (item.text
        .split('\n')
        .map(line => line.trim())
        .find(line => line.length > 0)
        ?.replace(/^[#>\s-]+|[*`]/g, '') ?? '');

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

/** Agent "wait" calls (`kind: other`, title `wait`) are noise: hidden from the chat, still in the transcript. */
export const isWaitToolCall = (item: ChatItem): boolean =>
  item.kind === 'tool_call' && item.toolKind === 'other' && item.title === 'wait';

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
