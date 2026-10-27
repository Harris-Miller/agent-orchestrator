import { assert, describe, it } from '@effect/vitest';
import { Schema } from 'effect';

import {
  AgentNotificationRpcs,
  AgentRequestRpcs,
  ClientNotificationRpcs,
  ClientRequestRpcs,
  ContentBlock,
  ProtocolNotificationRpcs,
  UnstableSessionArchiveRpcs,
  UnstableSessionForkRpcs,
} from './AcpSchema.ts';
import { SESSION_ARCHIVE_METHOD, SESSION_FORK_METHOD } from './schema/agent.ts';

const STABLE_AGENT_REQUESTS = [
  'initialize',
  'authenticate',
  'logout',
  'session/new',
  'session/load',
  'session/list',
  'session/delete',
  'session/resume',
  'session/close',
  'session/set_mode',
  'session/set_config_option',
  'session/prompt',
] as const;

const STABLE_AGENT_NOTIFICATIONS = ['session/cancel'] as const;

const STABLE_CLIENT_REQUESTS = [
  'session/request_permission',
  'fs/read_text_file',
  'fs/write_text_file',
  'terminal/create',
  'terminal/output',
  'terminal/release',
  'terminal/wait_for_exit',
  'terminal/kill',
  'elicitation/create',
] as const;

const STABLE_CLIENT_NOTIFICATIONS = ['session/update', 'elicitation/complete'] as const;

const STABLE_PROTOCOL_NOTIFICATIONS = ['$/cancel_request'] as const;

const tagsOf = (group: { readonly requests: ReadonlyMap<string, unknown> }): ReadonlySet<string> =>
  new Set(group.requests.keys());

const assertExactTags = (group: { readonly requests: ReadonlyMap<string, unknown> }, expected: readonly string[]) => {
  const actual = tagsOf(group);
  assert.deepStrictEqual([...actual].sort(), [...expected].sort());
};

describe('AcpSchema stable v1 allowlist', () => {
  it('AgentRequestRpcs matches stable agent requests', () => {
    assertExactTags(AgentRequestRpcs, STABLE_AGENT_REQUESTS);
  });

  it('AgentNotificationRpcs matches stable agent notifications', () => {
    assertExactTags(AgentNotificationRpcs, STABLE_AGENT_NOTIFICATIONS);
  });

  it('ClientRequestRpcs matches stable client requests', () => {
    assertExactTags(ClientRequestRpcs, STABLE_CLIENT_REQUESTS);
  });

  it('ClientNotificationRpcs matches stable client notifications', () => {
    assertExactTags(ClientNotificationRpcs, STABLE_CLIENT_NOTIFICATIONS);
  });

  it('ProtocolNotificationRpcs matches $/cancel_request', () => {
    assertExactTags(ProtocolNotificationRpcs, STABLE_PROTOCOL_NOTIFICATIONS);
  });

  it('allowlist has exactly 25 methods', () => {
    const all = [
      ...STABLE_AGENT_REQUESTS,
      ...STABLE_AGENT_NOTIFICATIONS,
      ...STABLE_CLIENT_REQUESTS,
      ...STABLE_CLIENT_NOTIFICATIONS,
      ...STABLE_PROTOCOL_NOTIFICATIONS,
    ];
    assert.strictEqual(all.length, 25);
    assert.strictEqual(new Set(all).size, 25);
  });

  it('session/fork stays off the stable AgentRequestRpcs allowlist', () => {
    assert.strictEqual(tagsOf(AgentRequestRpcs).has(SESSION_FORK_METHOD), false);
    assertExactTags(UnstableSessionForkRpcs, [SESSION_FORK_METHOD]);
  });

  it('_session/archive stays off the stable AgentRequestRpcs allowlist', () => {
    assert.strictEqual(tagsOf(AgentRequestRpcs).has(SESSION_ARCHIVE_METHOD), false);
    assertExactTags(UnstableSessionArchiveRpcs, [SESSION_ARCHIVE_METHOD]);
  });
});

describe('ContentBlock image', () => {
  it('decodes image with optional uri omitted', () => {
    assert.deepStrictEqual(
      Schema.decodeSync(ContentBlock)({
        data: 'iVBORw0KGgo=',
        mimeType: 'image/png',
        type: 'image',
      }),
      {
        data: 'iVBORw0KGgo=',
        mimeType: 'image/png',
        type: 'image',
      },
    );
  });

  it('decodes image with uri present', () => {
    assert.deepStrictEqual(
      Schema.decodeSync(ContentBlock)({
        data: 'iVBORw0KGgo=',
        mimeType: 'image/png',
        type: 'image',
        uri: 'file:///tmp/a.png',
      }),
      {
        data: 'iVBORw0KGgo=',
        mimeType: 'image/png',
        type: 'image',
        uri: 'file:///tmp/a.png',
      },
    );
  });
});
