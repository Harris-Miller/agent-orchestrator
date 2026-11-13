import { assert, describe, it } from '@effect/vitest';
import { CreateElicitationFormRequest } from '@libs/effect-acp';
import { Schema } from 'effect';

import {
  canAcceptElicitation,
  elicitationContent,
  elicitationFieldError,
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
    const views = elicitationFieldViews(claudeFixture);
    assert.strictEqual(views.length, 1);
    const [first] = views;
    assert.strictEqual(first.kind, 'single');
    assert.deepStrictEqual(first.kind === 'single' ? first.options : [], [
      { label: 'Restart now (Recommended)', value: 'Restart now (Recommended)' },
      { label: 'Defer', value: 'Defer' },
    ]);
    assert.strictEqual(first.label, claudeQuestion);
    assert.strictEqual(first.caption, 'Update+live');
    assert.deepStrictEqual(first.kind === 'single' ? first.other : undefined, {
      name: 'question_0_custom',
      placeholder: claudeOther,
    });
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

  it('maps array items oneOf/anyOf/enum to multi', () => {
    const [byOneOf, byEnum, byAnyOf] = elicitationFieldViews(
      request({
        byEnum: { items: { enum: ['x'], type: 'string' }, type: 'array' },
        byOneOf: { items: { oneOf, type: 'string' }, type: 'array' },
        byAnyOf: { items: { anyOf: oneOf }, type: 'array' },
      }),
    );
    assert.strictEqual(byOneOf.kind, 'multi');
    assert.strictEqual(byEnum.kind, 'multi');
    assert.strictEqual(byAnyOf.kind, 'multi');
    assert.deepStrictEqual(byAnyOf.kind === 'multi' ? byAnyOf.options.map(o => o.label) : [], ['Alpha', 'Beta']);
  });

  it('leaves a custom field with no matching choice question as text', () => {
    const views = elicitationFieldViews(
      request({
        orphan: { _meta: { _askUserQuestionCustomAnswer: { questionId: 'missing' } }, type: 'string' },
      }),
    );
    assert.strictEqual(views[0].kind, 'text');
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

  it('required single is satisfied by Other text alone', () => {
    const views = elicitationFieldViews(request(claudeProperties, ['question_0']));
    assert.isFalse(canAcceptElicitation(views, { question_0_custom: '' }));
    assert.isTrue(canAcceptElicitation(views, { question_0_custom: 'mine' }));
  });

  it('Other text counts toward multi minItems', () => {
    const views = elicitationFieldViews(
      request({
        m: { items: { anyOf: oneOf }, minItems: 1, type: 'array' },
        m_custom: { _meta: { _askUserQuestionCustomAnswer: { questionId: 'm' } }, type: 'string' },
      }),
    );
    assert.isFalse(canAcceptElicitation(views, { m: [] }));
    assert.isTrue(canAcceptElicitation(views, { m: [], m_custom: 'mine' }));
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

  it('shows Other only when filled, on its question row', () => {
    const claudeViews = elicitationFieldViews(claudeFixture);
    assert.deepStrictEqual(elicitationSummaryRows(claudeViews, { question_0_custom: '' }), []);
    const rows = elicitationSummaryRows(claudeViews, { question_0_custom: 'Custom' });
    assert.deepStrictEqual(
      rows.map(r => [r.label, r.value]),
      [[claudeQuestion, 'Custom']],
    );
  });

  it('combines selected options with Other text', () => {
    const multi = elicitationFieldViews(
      request({
        m: { items: { anyOf: oneOf }, title: 'M', type: 'array' },
        m_custom: { _meta: { _askUserQuestionCustomAnswer: { questionId: 'm' } }, type: 'string' },
      }),
    );
    const rows = elicitationSummaryRows(multi, { m: ['a'], m_custom: 'Gamma' });
    assert.deepStrictEqual(
      rows.map(r => r.value),
      ['Alpha, Gamma'],
    );
  });
});

describe('elicitationFieldError', () => {
  const view = (property: Record<string, unknown>) => elicitationFieldViews(request({ q: property }))[0];

  it('enforces number/integer bounds and whole numbers', () => {
    const v = view({ maximum: 10, minimum: 1, type: 'integer' });
    assert.isUndefined(elicitationFieldError(v, undefined));
    assert.isUndefined(elicitationFieldError(v, 5));
    assert.isDefined(elicitationFieldError(v, 0));
    assert.isDefined(elicitationFieldError(v, 11));
    assert.isDefined(elicitationFieldError(v, 2.5));
    assert.isUndefined(elicitationFieldError(view({ type: 'number' }), 2.5));
  });

  it('enforces string length, pattern and format', () => {
    const len = view({ maxLength: 3, minLength: 2, type: 'string' });
    assert.isDefined(elicitationFieldError(len, 'a'));
    assert.isUndefined(elicitationFieldError(len, 'ab'));
    assert.isDefined(elicitationFieldError(len, 'abcd'));
    const pat = view({ pattern: '^[a-z]+$', type: 'string' });
    assert.isUndefined(elicitationFieldError(pat, 'abc'));
    assert.isDefined(elicitationFieldError(pat, 'ABC'));
    assert.isUndefined(elicitationFieldError(view({ pattern: '(', type: 'string' }), 'anything'));
    const email = view({ format: 'email', type: 'string' });
    assert.isUndefined(elicitationFieldError(email, 'a@b.co'));
    assert.isDefined(elicitationFieldError(email, 'nope'));
    assert.isDefined(elicitationFieldError(view({ format: 'ipv4', type: 'string' }), '999.1.1.1'));
    assert.isUndefined(elicitationFieldError(view({ format: 'ipv4', type: 'string' }), '10.0.0.1'));
    assert.isUndefined(elicitationFieldError(view({ format: 'date', type: 'string' }), '2026-11-02'));
    assert.isDefined(elicitationFieldError(view({ format: 'date', type: 'string' }), 'tomorrow'));
  });

  it('blocks accept while a set value is invalid, even when optional', () => {
    const views = [view({ maximum: 10, type: 'integer' })];
    assert.isTrue(canAcceptElicitation(views, {}));
    assert.isTrue(canAcceptElicitation(views, { q: 3 }));
    assert.isFalse(canAcceptElicitation(views, { q: 30 }));
  });

  it('marks secret fields', () => {
    assert.isTrue(view({ _meta: { codex: { isSecret: true } }, type: 'string' }).secret);
  });
});

const codexNote = {
  _meta: { codex: { questionId: 'question_0', role: 'user_note' } },
  title: 'Additional answer or note',
  type: 'string',
};
const codexProperties = {
  question_0: { description: 'Pick one?', oneOf, title: 'Pick', type: 'string' },
  question_0_note: codexNote,
};

describe('elicitation note', () => {
  it('folds a codex user_note into its choice question', () => {
    const views = elicitationFieldViews(request(codexProperties));
    assert.strictEqual(views.length, 1);
    const [first] = views;
    assert.deepStrictEqual(first.kind === 'single' ? first.note : undefined, {
      name: 'question_0_note',
      placeholder: 'Additional answer or note',
    });
  });

  it('keeps a note standalone when its target is not a choice question or is missing', () => {
    const textTarget = elicitationFieldViews(
      request({ question_0: { title: 'Q', type: 'string' }, question_0_note: codexNote }),
    );
    assert.strictEqual(textTarget.length, 2);
    const orphan = elicitationFieldViews(request({ other_note: codexNote }));
    assert.strictEqual(orphan.length, 1);
    const unmarked = elicitationFieldViews(
      request({ question_0: codexProperties.question_0, question_0_note: { title: 'Note', type: 'string' } }),
    );
    assert.strictEqual(unmarked.length, 2);
  });

  it('keeps Claude custom-answer pairing as other, not note', () => {
    const [first] = elicitationFieldViews(claudeFixture);
    assert.isDefined(first.kind === 'single' ? first.other : undefined);
    assert.isUndefined(first.kind === 'single' ? first.note : {});
  });

  it('counts a note toward required and summarises note-only / option+note', () => {
    const views = elicitationFieldViews(request(codexProperties, ['question_0']));
    assert.isFalse(canAcceptElicitation(views, {}));
    const noteOnly = { question_0_note: 'hello' };
    assert.isTrue(canAcceptElicitation(views, noteOnly));
    assert.deepStrictEqual(elicitationSummaryRows(views, noteOnly), [
      { caption: 'Pick', label: 'Pick one?', note: undefined, value: 'hello' },
    ]);
    const both = { question_0: 'a', question_0_note: 'why' };
    assert.deepStrictEqual(elicitationSummaryRows(views, both), [
      { caption: 'Pick', label: 'Pick one?', note: 'why', value: 'Alpha' },
    ]);
    assert.deepStrictEqual(elicitationContent(both), both);
  });
});
