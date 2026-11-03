import { assert, describe, it } from '@effect/vitest';
import { CreateElicitationFormRequest } from '@libs/effect-acp';
import { Schema } from 'effect';

import {
  canAcceptElicitation,
  elicitationContent,
  elicitationFieldViews,
  elicitationSummaryRows,
  initialElicitationValues,
} from './elicitationFormViews.ts';

const request = (properties: Record<string, unknown>, required?: string[]): CreateElicitationFormRequest =>
  Schema.decodeUnknownSync(CreateElicitationFormRequest)({
    message: 'Questions',
    mode: 'form',
    requestedSchema: { properties, ...(required && { required }), type: 'object' },
    sessionId: 's1',
  });

const oneOf = [
  { const: 'a', title: 'Alpha' },
  { const: 'b', title: 'Beta' },
];

// `question_0` / `question_0_custom` from the elicitation/create payload in issue #220.
const claudeQuestion =
  'Q17: "Install vX" while that provider has live sessions — restart its harness immediately (kills in-flight turns; old runtime dir is deleted per Q3, so lazy Node requires could break otherwise)?';
const claudeOther = 'Type your own answer, or add a note to the option you chose above (optional).';
const claudeProperties = {
  question_0: {
    description: claudeQuestion,
    oneOf: [
      { const: 'Restart now (Recommended)', title: 'Restart now (Recommended)' },
      { const: 'Defer', title: 'Defer' },
    ],
    title: 'Update+live',
    type: 'string',
  },
  question_0_custom: {
    _meta: {
      _askUserQuestionCustomAnswer: { isCustomAnswer: true, questionId: 'question_0' },
      jetbrains: { air: { customAnswer: { isCustomAnswer: true, questionId: 'question_0' }, version: 1 } },
    },
    description: claudeOther,
    title: 'Other',
    type: 'string',
  },
};
const claudeFixture = request(claudeProperties);

describe('elicitationFieldViews', () => {
  it('maps oneOf to single with titles as labels', () => {
    const [first, second] = elicitationFieldViews(claudeFixture);
    assert.strictEqual(first.kind, 'single');
    assert.deepStrictEqual(first.kind === 'single' ? first.options : [], [
      { label: 'Restart now (Recommended)', value: 'Restart now (Recommended)' },
      { label: 'Defer', value: 'Defer' },
    ]);
    assert.strictEqual(first.label, claudeQuestion);
    assert.strictEqual(first.caption, 'Update+live');
    assert.strictEqual(second.kind, 'text');
    assert.strictEqual(second.label, claudeOther);
    assert.strictEqual(second.caption, 'Other');
  });

  it('maps enum to single, oneOf wins over enum', () => {
    const [both, plain] = elicitationFieldViews(
      request({
        both: { enum: ['x'], oneOf, type: 'string' },
        plain: { enum: ['x', 'y'], type: 'string' },
      }),
    );
    assert.deepStrictEqual(both.kind === 'single' ? both.options.map(o => o.value) : [], ['a', 'b']);
    assert.deepStrictEqual(plain.kind === 'single' ? plain.options : [], [
      { label: 'x', value: 'x' },
      { label: 'y', value: 'y' },
    ]);
  });

  it('maps array items oneOf/enum to multi', () => {
    const [byOneOf, byEnum] = elicitationFieldViews(
      request({
        byEnum: { items: { enum: ['x'], type: 'string' }, type: 'array' },
        byOneOf: { items: { oneOf, type: 'string' }, type: 'array' },
      }),
    );
    assert.strictEqual(byOneOf.kind, 'multi');
    assert.strictEqual(byEnum.kind, 'multi');
  });
});

describe('values + accept gating', () => {
  it('does not preselect without default; payload has no required, so empty is acceptable', () => {
    const views = elicitationFieldViews(claudeFixture);
    const values = initialElicitationValues(views);
    assert.strictEqual(values.question_0, undefined);
    assert.isTrue(canAcceptElicitation(views, values));
  });

  it('gates required', () => {
    const views = elicitationFieldViews(request(claudeProperties, ['question_0']));
    const values = initialElicitationValues(views);
    assert.isFalse(canAcceptElicitation(views, values));
    assert.isTrue(canAcceptElicitation(views, { ...values, question_0: 'Defer' }));
  });

  it('gates multi on minItems/maxItems', () => {
    const multi = elicitationFieldViews(
      request({ m: { items: { enum: ['x', 'y', 'z'], type: 'string' }, maxItems: 2, minItems: 1, type: 'array' } }),
    );
    assert.isFalse(canAcceptElicitation(multi, { m: [] }));
    assert.isTrue(canAcceptElicitation(multi, { m: ['x'] }));
    assert.isFalse(canAcceptElicitation(multi, { m: ['x', 'y', 'z'] }));
  });

  it('omits unset values from content', () => {
    assert.deepStrictEqual(elicitationContent({ a: undefined, b: '', c: 'v', d: false, e: 0, f: [] }), {
      c: 'v',
      d: false,
      e: 0,
    });
  });
});

describe('label/caption', () => {
  const view = (property: Record<string, unknown>) => elicitationFieldViews(request({ q: property }))[0];

  it('longer text is the label (Codex shape)', () => {
    const v = view({ description: 'Header', title: 'Which database should we use?', type: 'string' });
    assert.strictEqual(v.label, 'Which database should we use?');
    assert.strictEqual(v.caption, 'Header');
  });

  it('single or equal-length texts', () => {
    assert.deepStrictEqual(
      [view({ title: 'Only', type: 'string' }).label, view({ title: 'Only', type: 'string' }).caption],
      ['Only', undefined],
    );
    const same = view({ description: 'bb', title: 'aa', type: 'string' });
    assert.strictEqual(same.label, 'bb');
    assert.strictEqual(same.caption, 'aa');
  });
});

describe('elicitationSummaryRows', () => {
  const views = elicitationFieldViews(
    request({
      flag: { description: 'Enabled?', type: 'boolean' },
      many: { items: { oneOf, type: 'string' }, title: 'Many', type: 'array' },
      one: { description: 'Which one?', oneOf, title: 'Pick', type: 'string' },
      other: { title: 'Other', type: 'string' },
      pw: { _meta: { codex: { isSecret: true } }, title: 'Password', type: 'string' },
    }),
  );

  it('shows option labels, joins multi, yes/no, masks secrets, skips unset', () => {
    const rows = elicitationSummaryRows(views, {
      flag: true,
      many: ['a', 'b'],
      one: 'a',
      other: '',
      pw: 'hunter2',
    });
    assert.deepStrictEqual(
      rows.map(r => [r.label, r.value]),
      [
        ['Enabled?', 'Yes'],
        ['Many', 'Alpha, Beta'],
        ['Which one?', 'Alpha'],
        ['Password', '••••••'],
      ],
    );
  });

  it('shows Other only when filled', () => {
    const rows = elicitationSummaryRows(views, { other: 'Custom' });
    assert.deepStrictEqual(
      rows.map(r => [r.label, r.value]),
      [['Other', 'Custom']],
    );
  });
});
