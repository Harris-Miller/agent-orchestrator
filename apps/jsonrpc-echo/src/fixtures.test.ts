import { assert, describe, it } from '@effect/vitest';

import { applyPromptTemplate, parseFixtureLines, promptText, resolveFixtureName } from './fixtures.ts';

describe('fixtures', () => {
  it('resolveFixtureName uses /fixture prefix or defaults to simple-reply', () => {
    assert.strictEqual(resolveFixtureName([{ text: 'hello', type: 'text' }]), 'simple-reply');
    assert.strictEqual(resolveFixtureName([{ text: '/fixture tool-turn', type: 'text' }]), 'tool-turn');
    assert.strictEqual(
      resolveFixtureName([
        { text: 'ignore me', type: 'text' },
        { text: '/fixture usage', type: 'text' },
      ]),
      'usage',
    );
  });

  it('parseFixtureLines skips blanks and comments', () => {
    const updates = parseFixtureLines(`
      # plan step
      {"sessionUpdate":"plan","entries":[]}

      {"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"hi"}}
    `);

    assert.strictEqual(updates.length, 2);
    assert.strictEqual((updates[0] as { sessionUpdate: string }).sessionUpdate, 'plan');
    assert.strictEqual((updates[1] as { sessionUpdate: string }).sessionUpdate, 'agent_message_chunk');
  });

  it('applyPromptTemplate replaces {{promptText}} leaves', () => {
    const prompt = [{ text: 'Hello\nworld', type: 'text' }];
    const text = promptText(prompt);
    const update = applyPromptTemplate(
      {
        content: { text: '{{promptText}}', type: 'text' },
        sessionUpdate: 'agent_message_chunk',
      },
      text,
    ) as { content: { text: string } };

    assert.strictEqual(update.content.text, 'Hello\nworld');
  });
});
