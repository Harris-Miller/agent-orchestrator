import { assert, describe, it } from '@effect/vitest';
import type { ChatItem } from '@lib/ui';

import { buildTargetHandoffSeedPrompt, extractHandoffDocument, SOURCE_HANDOFF_PROMPT } from './handoffDocument.ts';

const agentMessage = (id: string, text: string): ChatItem => ({
  id,
  kind: 'agent_message',
  text,
});

const userMessage = (id: string, text: string): ChatItem => ({
  id,
  kind: 'user_message',
  text,
});

describe('handoffDocument', () => {
  it('SOURCE_HANDOFF_PROMPT asks for handoff tags', () => {
    assert.ok(SOURCE_HANDOFF_PROMPT.includes('<handoff>'));
    assert.ok(SOURCE_HANDOFF_PROMPT.includes('</handoff>'));
  });

  it('buildTargetHandoffSeedPrompt wraps handoff document in handoff tags', () => {
    const prompt = buildTargetHandoffSeedPrompt('Plan auth next.');
    assert.ok(prompt.includes('<handoff>\nPlan auth next.\n</handoff>'));
    assert.ok(prompt.includes('Here is a handoff document from a previous agent chat:'));
    assert.ok(prompt.includes('ask the user what they would like to do next'));
  });

  it('extractHandoffDocument returns inner tags from last agent_message', () => {
    const items: readonly ChatItem[] = [
      userMessage('u1', 'hello'),
      agentMessage('a1', 'earlier reply'),
      userMessage('u2', SOURCE_HANDOFF_PROMPT),
      agentMessage('a2', 'Preamble.\n<handoff>\nDo the thing.\n</handoff>\nThanks.'),
    ];
    assert.strictEqual(extractHandoffDocument(items), 'Do the thing.');
  });

  it('extractHandoffDocument falls back to full last agent_message when tags missing', () => {
    const items: readonly ChatItem[] = [agentMessage('a1', 'No tags here, full agent reply.')];
    assert.strictEqual(extractHandoffDocument(items), 'No tags here, full agent reply.');
  });

  it('extractHandoffDocument returns undefined for empty chat or empty agent text', () => {
    assert.strictEqual(extractHandoffDocument([]), undefined);
    assert.strictEqual(extractHandoffDocument([userMessage('u1', 'only user')]), undefined);
    assert.strictEqual(extractHandoffDocument([agentMessage('a1', '   ')]), undefined);
    assert.strictEqual(extractHandoffDocument([agentMessage('a1', '<handoff>\n\n</handoff>')]), undefined);
  });
});
