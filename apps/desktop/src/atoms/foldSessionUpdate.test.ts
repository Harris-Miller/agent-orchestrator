import { assert, describe, it } from '@effect/vitest';

import { initialSessionSnapshot } from '../acp/acpSessionBootstrap.ts';
import { emptyChatAccumulator } from '../acp/sessionUpdateReducer.ts';

import { foldSessionUpdate } from './foldSessionUpdate.ts';

describe('foldSessionUpdate', () => {
  it('returns noop for non-chat updates with no side effects', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldSessionUpdate(session, {
      sessionUpdate: 'usage_update',
      size: 100,
      used: 10,
    });
    assert.strictEqual(result.kind, 'noop');
  });

  it('returns noop for available_commands_update (commands handled separately)', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldSessionUpdate(session, {
      availableCommands: [{ name: 'test' }],
      sessionUpdate: 'available_commands_update',
    });
    assert.strictEqual(result.kind, 'noop');
  });

  it('patches transcript for chat-mutating updates', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldSessionUpdate(session, {
      content: { text: 'hello', type: 'text' },
      sessionUpdate: 'agent_message_chunk',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.transcriptChanged, true);
      assert.strictEqual(result.shouldSyncConfig, false);
      assert.strictEqual(result.sessionInfoTitle, undefined);
      assert.strictEqual(result.transcript.items.length, 1);
      assert.strictEqual(result.transcript.items[0]?.kind, 'agent_message');
    }
  });

  it('flags config sync for config_option_update when not activating', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldSessionUpdate(session, {
      configOptions: [{ id: 'mode', name: 'Mode' }],
      sessionUpdate: 'config_option_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.shouldSyncConfig, true);
      assert.strictEqual(result.transcriptChanged, true);
    }
  });

  it('skips config sync while activating but still patches title', () => {
    const session = initialSessionSnapshot('s1', 'activating');
    const result = foldSessionUpdate(session, {
      sessionUpdate: 'session_info_update',
      title: 'New title',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.shouldSyncConfig, false);
      assert.strictEqual(result.transcriptChanged, false);
      assert.strictEqual(result.sessionInfoTitle, 'New title');
      assert.strictEqual(result.transcript, session.transcript);
    }
  });

  it('folds from empty when session is undefined', () => {
    const result = foldSessionUpdate(undefined, {
      content: { text: 'hi', type: 'text' },
      sessionUpdate: 'user_message_chunk',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(result.transcript.items[0], {
        id: result.transcript.items[0]?.id,
        kind: 'user_message',
        text: 'hi',
      });
      assert.notStrictEqual(result.transcript, emptyChatAccumulator());
    }
  });
});
