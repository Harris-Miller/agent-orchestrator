import { assert, describe, it } from '@effect/vitest';

import type { ChatItem } from '../../host/sessionUpdateReducer.ts';

import { groupChatItems } from './groupChatItems.ts';
import type { WorkRegion } from './groupChatItems.ts';

const u = (id: string, extra: object = {}): ChatItem => ({ id, kind: 'user_message', text: id, ...extra });
const a = (id: string): ChatItem => ({ id, kind: 'agent_message', text: id });
const t = (id: string): ChatItem => ({ id, kind: 'tool_call', status: 'completed', title: id, toolCallId: id });
const c = (id: string): ChatItem => ({ id, kind: 'config_options', options: [] });
const s = (id: string): ChatItem => ({ id, kind: 'elicitation_summary', message: id, rows: [] });
const shape = (items: readonly ChatItem[]) =>
  groupChatItems(items).map(i => (i.kind === 'work_region' ? `R[${i.items.map(x => x.id).join(',')}]` : i.id));

describe('groupChatItems', () => {
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
  it('config after answer stays flat after it', () => {
    assert.deepStrictEqual(shape([u('u'), t('t'), a('a'), c('c')]), ['u', 'R[t]', 'a', 'c']);
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
