import { assert, describe, it } from '@effect/vitest';
import { CreateElicitationFormRequest } from '@libs/effect-acp';
import { Schema } from 'effect';

import {
  canAcceptElicitation,
  elicitationContent,
  elicitationFieldViews,
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

const claudeFixture = request(
  {
    question_0: { description: 'Which one?', oneOf, title: 'Pick', type: 'string' },
    question_0_custom: { title: 'Pick (Other)', type: 'string' },
  },
  ['question_0'],
);

describe('elicitationFieldViews', () => {
  it('maps oneOf to single with titles as labels', () => {
    const [first, second] = elicitationFieldViews(claudeFixture);
    assert.strictEqual(first.kind, 'single');
    assert.deepStrictEqual(first.kind === 'single' ? first.options : [], [
      { label: 'Alpha', value: 'a' },
      { label: 'Beta', value: 'b' },
    ]);
    assert.strictEqual(first.description, 'Which one?');
    assert.strictEqual(second.kind, 'text');
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
  const views = elicitationFieldViews(claudeFixture);

  it('does not preselect without default and gates required', () => {
    const values = initialElicitationValues(views);
    assert.strictEqual(values.question_0, undefined);
    assert.isFalse(canAcceptElicitation(views, values));
    assert.isTrue(canAcceptElicitation(views, { ...values, question_0: 'a' }));
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
