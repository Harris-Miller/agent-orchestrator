import { assert, describe, it } from '@effect/vitest';

import { toolCallAttributes, toolLabel } from './toolCall.ts';

describe('tool call telemetry', () => {
  it('attributes carry the owner session ids, the tool and the outcome', () => {
    assert.deepStrictEqual(
      toolCallAttributes(
        {
          'acp.launch_target': 'claude-agent-acp',
          'acp.session.id': 'acp-child',
          'acp.session.parent_id': 'acp-parent',
        },
        'submit_handoff',
        'ok',
      ),
      {
        'acp.launch_target': 'claude-agent-acp',
        'acp.session.id': 'acp-child',
        'acp.session.parent_id': 'acp-parent',
        'hub.outcome': 'ok',
        'hub.tool': 'submit_handoff',
      },
    );
  });

  it('a tool name outside the allowlist is labelled unknown', () => {
    assert.strictEqual(toolLabel('free text <name>'), 'unknown');
  });
});
