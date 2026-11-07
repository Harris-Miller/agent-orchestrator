import { assert, describe, it } from '@effect/vitest';

import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo } from './acpSessionBootstrap.ts';
import { applySessionUpdate } from './applySessionUpdate.ts';
import { emptySessionTranscript } from './sessionUpdateReducer.ts';

const emptyHistory: readonly NormalizedSessionInfo[] = [];

describe('applySessionUpdate', () => {
  it('returns noop for unrecognized updates with no side effects', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyHistory, { sessionUpdate: 'unknown_kind' });
    assert.strictEqual(result.kind, 'noop');
  });

  it('patches transcript for chat-mutating updates', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyHistory, {
      content: { text: 'hello', type: 'text' },
      sessionUpdate: 'agent_message_chunk',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.usageChanged, false);
      assert.strictEqual(result.sessionHistory, undefined);
      assert.strictEqual(result.session.transcript.items.length, 1);
      assert.strictEqual(result.session.transcript.items[0]?.kind, 'agent_message');
    }
  });

  it('sets availableCommands for available_commands_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyHistory, {
      availableCommands: [{ description: 'Run tests', name: 'test' }],
      sessionUpdate: 'available_commands_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(result.session.availableCommands, [{ description: 'Run tests', name: 'test' }]);
      assert.strictEqual(result.usageChanged, false);
    }
  });

  it('sets usage and usageChanged for usage_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyHistory, {
      cost: { amount: 0.01, currency: 'USD' },
      sessionUpdate: 'usage_update',
      size: 100,
      used: 10,
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.usageChanged, true);
      assert.deepStrictEqual(result.session.usage, {
        cost: { amount: 0.01, currency: 'USD' },
        size: 100,
        used: 10,
      });
    }
  });

  it('returns noop for malformed usage_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyHistory, {
      sessionUpdate: 'usage_update',
      size: 100,
    });
    assert.strictEqual(result.kind, 'noop');
  });

  it('applies config_option_update onto session configuration', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyHistory, {
      configOptions: [{ id: 'mode', name: 'Mode' }],
      sessionUpdate: 'config_option_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.usageChanged, false);
      assert.ok(result.session.sessionConfiguration !== undefined);
    }
  });

  it('applies config while activating', () => {
    const session = initialSessionSnapshot('s1', 'activating');
    const result = applySessionUpdate(session, 's1', emptyHistory, {
      configOptions: [{ currentValue: 'ask', id: 'mode', name: 'Mode' }],
      sessionUpdate: 'config_option_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.ok(result.session.sessionConfiguration !== undefined);
    }
  });

  it('patches history title for session_info_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const history: readonly NormalizedSessionInfo[] = [{ cwd: '/proj', sessionId: 's1', title: 'Old' }];
    const result = applySessionUpdate(session, 's1', history, {
      sessionUpdate: 'session_info_update',
      title: 'New title',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.usageChanged, false);
      assert.deepStrictEqual(result.sessionHistory, [{ cwd: '/proj', sessionId: 's1', title: 'New title' }]);
      assert.strictEqual(result.session.transcript, session.transcript);
    }
  });

  it('seeds initialSessionSnapshot when session is undefined', () => {
    const result = applySessionUpdate(undefined, 's1', emptyHistory, {
      availableCommands: [{ name: 'help' }],
      sessionUpdate: 'available_commands_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.session.sessionId, 's1');
      assert.strictEqual(result.session.status, 'inactive');
      assert.deepStrictEqual(result.session.availableCommands, [{ description: undefined, name: 'help' }]);
    }
  });

  it('folds transcript from empty when session is undefined', () => {
    const result = applySessionUpdate(undefined, 's1', emptyHistory, {
      content: { text: 'hi', type: 'text' },
      sessionUpdate: 'user_message_chunk',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(result.session.transcript.items[0], {
        id: result.session.transcript.items[0]?.id,
        kind: 'user_message',
        text: 'hi',
      });
      assert.notStrictEqual(result.session.transcript, emptySessionTranscript());
    }
  });
});
