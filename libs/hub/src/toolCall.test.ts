import { assert, describe, it } from '@effect/vitest';
import { Cause, Exit } from 'effect';

import { toolLabel } from './protocol.ts';
import { outcomeOf, toolCallAttributes } from './toolCall.ts';

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

  it('a typed failure is rejected only before routing; after it, it is an error', () => {
    const failed = Exit.fail('bad args');
    assert.strictEqual(outcomeOf(failed, false), 'rejected');
    assert.strictEqual(outcomeOf(failed, true), 'error');
  });

  it('a defect is an error, an interrupt (alone) is interrupted: one outcome per exit', () => {
    assert.strictEqual(outcomeOf(Exit.die(new Error('boom')), false), 'error');
    assert.strictEqual(outcomeOf(Exit.failCause(Cause.interrupt(1)), true), 'interrupted');
    assert.strictEqual(outcomeOf(Exit.failCause(Cause.interrupt(1)), false), 'interrupted');
  });
});
