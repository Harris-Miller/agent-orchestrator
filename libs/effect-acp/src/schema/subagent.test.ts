import { assert, describe, it } from '@effect/vitest';
import { Option, Schema } from 'effect';

import { SubagentUpdate } from './subagent.ts';

const decode = Schema.decodeUnknownOption(SubagentUpdate);

describe('SubagentUpdate', () => {
  it('decodes the observed spawn shape and ignores unknown fields', () => {
    const decoded = decode({
      capabilities: {},
      name: 'Alpha',
      prompt: 'ignored',
      sessionUpdate: 'subagent_spawned',
      subagentSessionId: 'c1',
      task: 'Delegated task',
    });
    assert.isTrue(Option.isSome(decoded));
  });

  it('decodes string and object work states and null patches', () => {
    assert.isTrue(
      Option.isSome(decode({ sessionUpdate: 'subagent_state_update', state: 'completed', subagentSessionId: 'c1' })),
    );
    assert.isTrue(
      Option.isSome(
        decode({
          name: null,
          sessionUpdate: 'subagent_update',
          state: { state: 'failed', stopReason: 'x' },
          subagentSessionId: 'c1',
        }),
      ),
    );
  });

  it('rejects an empty id, wrong kinds, and malformed fields', () => {
    assert.isTrue(Option.isNone(decode({ sessionUpdate: 'subagent_spawned', subagentSessionId: '' })));
    assert.isTrue(Option.isNone(decode({ sessionUpdate: 'agent_message_chunk', subagentSessionId: 'c1' })));
    assert.isTrue(Option.isNone(decode({ sessionUpdate: 'subagent_update', state: 5, subagentSessionId: 'c1' })));
  });
});
