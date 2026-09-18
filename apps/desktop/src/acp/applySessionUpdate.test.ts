import { assert, describe, it } from '@effect/vitest';

import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo } from './acpSessionBootstrap.ts';
import { applySessionUpdate, withUserChatMessage } from './applySessionUpdate.ts';
import { emptySessionTranscript } from './sessionUpdateReducer.ts';

const emptyRoster: readonly NormalizedSessionInfo[] = [];

describe('withUserChatMessage', () => {
  it('appends a user_message and preserves other session fields', () => {
    const session = { ...initialSessionSnapshot('s1', 'active'), cwd: '/proj' };
    const next = withUserChatMessage(session, 'hello');
    assert.strictEqual(next.cwd, '/proj');
    assert.strictEqual(next.sessionId, 's1');
    assert.strictEqual(next.status, 'active');
    assert.strictEqual(next.transcript.items.length, 1);
    assert.deepStrictEqual(next.transcript.items[0], {
      id: next.transcript.items[0]?.id,
      kind: 'user_message',
      text: 'hello',
    });
    assert.notStrictEqual(next.transcript, session.transcript);
  });
});

describe('applySessionUpdate', () => {
  it('returns noop for unrecognized updates with no side effects', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyRoster, { sessionUpdate: 'unknown_kind' });
    assert.strictEqual(result.kind, 'noop');
  });

  it('patches transcript for chat-mutating updates', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyRoster, {
      content: { text: 'hello', type: 'text' },
      sessionUpdate: 'agent_message_chunk',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.shouldSyncConfig, false);
      assert.strictEqual(result.usageChanged, false);
      assert.strictEqual(result.sessionRoster, undefined);
      assert.strictEqual(result.session.transcript.items.length, 1);
      assert.strictEqual(result.session.transcript.items[0]?.kind, 'agent_message');
    }
  });

  it('sets availableCommands for available_commands_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyRoster, {
      availableCommands: [{ description: 'Run tests', name: 'test' }],
      sessionUpdate: 'available_commands_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(result.session.availableCommands, [{ description: 'Run tests', name: 'test' }]);
      assert.strictEqual(result.usageChanged, false);
      assert.strictEqual(result.shouldSyncConfig, false);
    }
  });

  it('sets usage and usageChanged for usage_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyRoster, {
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
    const result = applySessionUpdate(session, 's1', emptyRoster, {
      sessionUpdate: 'usage_update',
      size: 100,
    });
    assert.strictEqual(result.kind, 'noop');
  });

  it('flags config sync for config_option_update when active', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = applySessionUpdate(session, 's1', emptyRoster, {
      configOptions: [{ id: 'mode', name: 'Mode' }],
      sessionUpdate: 'config_option_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.shouldSyncConfig, true);
      assert.strictEqual(result.usageChanged, false);
      assert.ok(result.session.sessionConfiguration !== undefined);
    }
  });

  it('applies config while activating but skips catalog sync', () => {
    const session = initialSessionSnapshot('s1', 'activating');
    const result = applySessionUpdate(session, 's1', emptyRoster, {
      configOptions: [{ currentValue: 'ask', id: 'mode', name: 'Mode' }],
      sessionUpdate: 'config_option_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.shouldSyncConfig, false);
      assert.ok(result.session.sessionConfiguration !== undefined);
    }
  });

  it('patches roster title for session_info_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const roster: readonly NormalizedSessionInfo[] = [{ cwd: '/proj', sessionId: 's1', title: 'Old' }];
    const result = applySessionUpdate(session, 's1', roster, {
      sessionUpdate: 'session_info_update',
      title: 'New title',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.shouldSyncConfig, false);
      assert.strictEqual(result.usageChanged, false);
      assert.deepStrictEqual(result.sessionRoster, [{ cwd: '/proj', sessionId: 's1', title: 'New title' }]);
      assert.strictEqual(result.session.transcript, session.transcript);
    }
  });

  it('seeds initialSessionSnapshot when session is undefined', () => {
    const result = applySessionUpdate(undefined, 's1', emptyRoster, {
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
    const result = applySessionUpdate(undefined, 's1', emptyRoster, {
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
