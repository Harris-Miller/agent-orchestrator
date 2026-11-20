import { assert, describe, it } from '@effect/vitest';

import type { ChatItem } from '../../../../host/sessionUpdateReducer.ts';

import {
  groupChatItems,
  isFoldedSubagentToolCall,
  isWaitToolCall,
  splitWorkSegments,
  workItemPreviewText,
  workSegmentLabel,
} from './groupChatItems.ts';
import type { WorkRegion, WorkSegment } from './groupChatItems.ts';

const u = (id: string, extra: object = {}): ChatItem => ({ id, kind: 'user_message', text: id, ...extra });
const a = (id: string): ChatItem => ({ id, kind: 'agent_message', text: id });
const t = (id: string): ChatItem => ({ id, kind: 'tool_call', status: 'completed', title: id, toolCallId: id });
const wait = (id: string, extra: object = {}): ChatItem => ({
  id,
  kind: 'tool_call',
  status: 'completed',
  title: 'wait',
  toolCallId: id,
  toolKind: 'other',
  ...extra,
});
const s = (id: string): ChatItem => ({ id, kind: 'elicitation_summary', message: id, rows: [] });
const th = (id: string): ChatItem => ({ id, kind: 'agent_thought', text: id });
const p = (id: string): ChatItem => ({ entries: [], id, kind: 'plan' });
const sub = (id: string): ChatItem => ({ id, kind: 'subagent', subagentSessionId: id });
const fail = (id: string): ChatItem => ({
  actions: [],
  category: 'connection',
  id,
  kind: 'session_failure',
  revision: 1,
  severity: 'error',
  title: id,
});
const shape = (items: readonly ChatItem[]) =>
  groupChatItems(items.filter(item => !isWaitToolCall(item))).map(i =>
    i.kind === 'work_region' ? `R[${i.items.map(x => x.id).join(',')}]` : i.id,
  );

describe('isFoldedSubagentToolCall', () => {
  it('is true only for a tool call carrying Subagent results', () => {
    const result = {
      body: '',
      config: {},
      description: 'd',
      id: 'c',
      launchTarget: 'codex-acp',
      status: 'running',
      task: 't',
    } as const;
    assert.isTrue(
      isFoldedSubagentToolCall({
        id: 'x',
        kind: 'tool_call',
        status: 'completed',
        subagentResults: [result],
        title: 'x',
        toolCallId: 'x',
      }),
    );
    assert.isFalse(isFoldedSubagentToolCall(t('x')));
    assert.isFalse(isFoldedSubagentToolCall(a('x')));
  });
});

describe('groupChatItems', () => {
  it('hides wait tool calls (kind other, title wait)', () => {
    assert.deepStrictEqual(shape([u('u'), wait('w'), t('t'), wait('w2'), a('a')]), ['u', 'R[t]', 'a']);
  });
  it('turn of only wait tool calls has no region', () => {
    assert.deepStrictEqual(shape([u('u'), wait('w'), a('a')]), ['u', 'a']);
  });
  it('keeps tool calls that only match one of kind or title', () => {
    const items = [u('u'), wait('w1', { toolKind: 'read' }), wait('w2', { title: 'wait for build' })];
    assert.deepStrictEqual(shape(items), ['u', 'R[w1,w2]']);
  });
  it('session failure alone forms a region; with tool calls it joins them', () => {
    assert.deepStrictEqual(shape([u('u'), fail('f')]), ['u', 'R[f]']);
    assert.deepStrictEqual(shape([u('u'), t('t'), fail('f'), a('a')]), ['u', 'R[t,f]', 'a']);
  });
  it('answer-only turn has no region', () => {
    assert.deepStrictEqual(shape([u('u'), a('a')]), ['u', 'a']);
  });
  it('user, region, answer are siblings; user never inside region', () => {
    const out = groupChatItems([u('u'), t('t'), a('a')]);
    assert.deepStrictEqual(shape([u('u'), t('t'), a('a')]), ['u', 'R[t]', 'a']);
    assert.isFalse((out[1] as WorkRegion).items.some(i => i.kind === 'user_message'));
  });
  it('interim agent text goes inside region', () => {
    assert.deepStrictEqual(shape([u('u'), a('i'), t('t'), a('x'), t('t2'), a('a')]), ['u', 'R[i,t,x,t2]', 'a']);
  });
  it('summary after answer stays flat after it', () => {
    assert.deepStrictEqual(shape([u('u'), t('t'), a('a'), s('s')]), ['u', 'R[t]', 'a', 's']);
  });
  it('turn ending on tool call has no answer', () => {
    assert.deepStrictEqual(shape([u('u'), a('i'), t('t')]), ['u', 'R[i,t]']);
  });
  it('items before first user message stay flat', () => {
    assert.deepStrictEqual(shape([t('t0'), u('u'), t('t')]), ['t0', 'u', 'R[t]']);
  });
  it('isLastTurn only on final turn, even when final turn has no work; id is first work item', () => {
    const out = groupChatItems([u('u1'), a('i'), t('t1'), u('u2'), a('a')]);
    const region = out[1] as WorkRegion;
    assert.strictEqual(region.id, 't1');
    assert.isFalse(region.isLastTurn);
    const two = groupChatItems([u('u1'), t('t1'), u('u2'), t('t2')]).filter(i => i.kind === 'work_region');
    assert.deepStrictEqual(
      two.map(r => r.isLastTurn),
      [false, true],
    );
  });
  it('summary splits the region; only the last region is isLastInTurn', () => {
    const items = [u('u'), t('t1'), s('s'), t('t2'), a('a')];
    assert.deepStrictEqual(shape(items), ['u', 'R[t1]', 's', 'R[t2]', 'a']);
    const regions = groupChatItems(items).filter((i): i is WorkRegion => i.kind === 'work_region');
    assert.deepStrictEqual(
      regions.map(r => r.isLastInTurn),
      [false, true],
    );
  });
  it('summary with no work after it stays flat', () => {
    assert.deepStrictEqual(shape([u('u'), t('t'), s('s')]), ['u', 'R[t]', 's']);
  });
});

describe('splitWorkSegments', () => {
  const segShape = (items: readonly ChatItem[]) =>
    splitWorkSegments(items).map(x =>
      x.kind === 'work_segment' ? `S${x.id}[${x.items.map(i => i.id).join(',')}]` : x.id,
    );
  it('single segment', () => {
    assert.deepStrictEqual(segShape([t('t1'), th('h'), t('t2')]), ['St1[t1,h,t2]']);
  });
  it('interim agent message opening the region is a divider', () => {
    assert.deepStrictEqual(segShape([a('i'), t('t1'), a('x'), t('t2')]), ['i', 'St1[t1]', 'x', 'St2[t2]']);
  });
  it('back-to-back interim agent messages make no empty segment', () => {
    assert.deepStrictEqual(segShape([t('t1'), a('x'), a('y'), t('t2')]), ['St1[t1]', 'x', 'y', 'St2[t2]']);
  });
  it('subagent is a divider, like an interim agent message', () => {
    assert.deepStrictEqual(segShape([t('t1'), sub('sa'), a('x'), t('t2'), sub('sb')]), [
      'St1[t1]',
      'sa',
      'x',
      'St2[t2]',
      'sb',
    ]);
  });
  it('non-Work items between dividers are dividers, never an unlabeled segment', () => {
    assert.deepStrictEqual(segShape([t('t1'), a('x'), s('s'), a('y'), t('t2')]), ['St1[t1]', 'x', 's', 'y', 'St2[t2]']);
  });
  it('session failure is a work item in the segment', () => {
    assert.deepStrictEqual(segShape([t('t1'), fail('f')]), ['St1[t1,f]']);
  });
  it('agent thought is a work item, not a divider', () => {
    assert.deepStrictEqual(segShape([th('h1'), a('x'), th('h2')]), ['Sh1[h1]', 'x', 'Sh2[h2]']);
  });
});

describe('workSegmentLabel', () => {
  const label = (items: readonly ChatItem[]) =>
    workSegmentLabel({ id: 'x', items: items as WorkSegment['items'], kind: 'work_segment' });
  it('counts per kind in fixed order, pluralized', () => {
    assert.strictEqual(label([p('p'), th('h'), t('t1'), t('t2'), t('t3')]), '3 tool calls, 1 thought, 1 plan');
  });
  it('leaves out zero-count kinds', () => {
    assert.strictEqual(label([th('h1'), th('h2')]), '2 thoughts');
    assert.strictEqual(label([t('t'), p('p1'), p('p2')]), '1 tool call, 2 plans');
  });
});

describe('workItemPreviewText', () => {
  it('agent thought: first non-empty line', () => {
    assert.strictEqual(
      workItemPreviewText({ id: 'h', kind: 'agent_thought', text: '\n  \n**Reading** files\nthen more' }),
      'Reading files',
    );
  });
  it('plan: completed out of total', () => {
    assert.strictEqual(
      workItemPreviewText({
        entries: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }, { content: 'c' }],
        id: 'p',
        kind: 'plan',
      }),
      'Plan · 1/3 completed',
    );
  });
});
