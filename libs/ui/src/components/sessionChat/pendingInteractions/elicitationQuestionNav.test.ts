import { assert, describe, it } from '@effect/vitest';
import { CreateElicitationFormRequest } from '@libs/effect-acp';
import { Schema } from 'effect';

import { elicitationFieldViews, initialElicitationValues } from './elicitationFormViews.ts';
import {
  applyDigit,
  checkOther,
  enterAction,
  firstInvalidIndex,
  flagMessage,
  isFlagged,
  questionStatus,
  selectOption,
  setNoteText,
  setOtherText,
  toggleOption,
  uncheckOther,
} from './elicitationQuestionNav.ts';

const customAnswer = (questionId: string) => ({ _askUserQuestionCustomAnswer: { questionId } });

const views = elicitationFieldViews(
  Schema.decodeUnknownSync(CreateElicitationFormRequest)({
    message: 'Q',
    mode: 'form',
    requestedSchema: {
      properties: {
        q0: {
          oneOf: [
            { const: 'a', title: 'A' },
            { const: 'b', title: 'B' },
          ],
          type: 'string',
        },
        q0_custom: { _meta: customAnswer('q0'), title: 'Other', type: 'string' },
        q1: { items: { enum: ['x', 'y'], type: 'string' }, type: 'array' },
        q1_custom: { _meta: customAnswer('q1'), title: 'Other', type: 'string' },
        q2: { type: 'boolean' },
        q3: { maximum: 5, minimum: 1, type: 'integer' },
      },
      required: ['q0', 'q3'],
      type: 'object',
    },
    sessionId: 's',
  }),
);
const [single, multi, bool, int] = views;
const initial = initialElicitationValues(views);

describe('elicitationQuestionNav', () => {
  it('derives status per question', () => {
    assert.strictEqual(questionStatus(single, initial), 'invalid');
    assert.strictEqual(questionStatus(multi, initial), 'empty');
    assert.strictEqual(questionStatus(single, { ...initial, q0: 'a' }), 'answered');
    assert.strictEqual(questionStatus(int, { ...initial, q3: 9 }), 'invalid');
  });

  it('flags only after attention, or when a set value is bad', () => {
    assert.isFalse(isFlagged(single, initial, false));
    assert.isTrue(isFlagged(single, initial, true));
    assert.isFalse(isFlagged(multi, initial, true));
    assert.isTrue(isFlagged(int, { ...initial, q3: 9 }, false));
    assert.strictEqual(flagMessage(single, initial), 'Required');
    assert.strictEqual(flagMessage(int, { ...initial, q3: 9 }), 'At most 5');
  });

  it('navigates on Enter', () => {
    assert.strictEqual(firstInvalidIndex(views, initial), 0);
    assert.deepStrictEqual(enterAction(views, initial, 1), { kind: 'go', tab: 2 });
    assert.deepStrictEqual(enterAction(views, initial, views.length), { kind: 'go', tab: 0 });
    assert.deepStrictEqual(enterAction(views, { ...initial, q0: 'a', q3: 2 }, views.length), { kind: 'accept' });
  });

  it('picks single options and Other', () => {
    assert.strictEqual(applyDigit(single, 2, initial).values.q0, 'b');
    assert.strictEqual(applyDigit(single, 4, initial).values.q0, undefined);
    const other = applyDigit(single, 3, { ...initial, q0: 'a' });
    assert.strictEqual(other.values.q0, undefined);
    assert.strictEqual(other.values.q0_custom, '');
    assert.strictEqual(other.focusOther, 'q0_custom');
    assert.strictEqual(applyDigit(single, 1, other.values).values.q0_custom, undefined);
  });

  it('toggles multi options and Other', () => {
    const one = applyDigit(multi, 1, initial).values;
    assert.deepStrictEqual(one.q1, ['x']);
    assert.deepStrictEqual(applyDigit(multi, 1, one).values.q1, []);
    const other = applyDigit(multi, 3, one);
    assert.strictEqual(other.focusOther, 'q1_custom');
    assert.strictEqual(applyDigit(multi, 3, other.values).values.q1_custom, undefined);
  });

  it('toggles a boolean with 1 only and ignores digits on text questions', () => {
    assert.strictEqual(applyDigit(bool, 1, initial).values.q2, true);
    assert.strictEqual(applyDigit(bool, 2, initial).values, initial);
    assert.strictEqual(applyDigit(int, 1, initial).values, initial);
  });

  it('select/toggle/other helpers', () => {
    const s = views.find(v => v.kind === 'single');
    const m = views.find(v => v.kind === 'multi');
    if (s?.kind !== 'single' || m?.kind !== 'multi' || !s.other || !m.other) throw new Error('fixture');
    const { other: so } = s;
    const { other: mo } = m;
    assert.strictEqual(selectOption(s, 'b', { ...initial, q0_custom: 'x' }).q0_custom, undefined);
    assert.strictEqual(selectOption(s, 'b', initial).q0, 'b');
    assert.deepStrictEqual(toggleOption(m, 'x', initial).q1, ['x']);
    const checked = checkOther(s, so, { ...initial, q0: 'a' });
    assert.strictEqual(checked.q0, undefined);
    assert.strictEqual(checked.q0_custom, '');
    assert.strictEqual(checkOther(m, mo, { ...initial, q1_custom: 'k' }).q1_custom, 'k');
    assert.strictEqual(uncheckOther(mo, { ...initial, q1_custom: 'k' }).q1_custom, undefined);
    const typed = setOtherText(s, so, 'hi', { ...initial, q0: 'a' });
    assert.strictEqual(typed.q0_custom, 'hi');
    assert.strictEqual(typed.q0, undefined);
    assert.deepStrictEqual(setOtherText(m, mo, 'hi', { ...initial, q1: ['x'] }).q1, ['x']);
  });
});

describe('setNoteText', () => {
  const note = { name: 'n', placeholder: 'p' };
  it('sets, clears on empty, and leaves the selection alone', () => {
    assert.strictEqual(setNoteText(note, 'hi', { q0: 'a' }).n, 'hi');
    assert.strictEqual(setNoteText(note, 'hi', { q0: 'a' }).q0, 'a');
    assert.isUndefined(setNoteText(note, '', { n: 'hi' }).n);
  });
});
