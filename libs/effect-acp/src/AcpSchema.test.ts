import { assert, describe, it } from '@effect/vitest';
import { Schema } from 'effect';

import {
  AgentNotificationRpcs,
  AgentRequestRpcs,
  ClientNotificationRpcs,
  ClientRequestRpcs,
  ContentBlock,
  isAuthRequiredError,
  ProtocolNotificationRpcs,
  UnstableClientNotificationRpcs,
  UnstableSessionArchiveRpcs,
  UnstableSessionForkRpcs,
  UnstableSessionListSubscribeRpcs,
  UnstableSessionRenameRpcs,
  UnstableSessionSteeringRpcs,
} from './AcpSchema.ts';
import { SESSION_LIST_CHANGES_METHOD, SessionListChangesNotificationPayload } from './schema/client.ts';
import {
  ListSessionsRequest,
  SESSION_ARCHIVE_METHOD,
  SESSION_FORK_METHOD,
  SESSION_LIST_SUBSCRIBE_METHOD,
  SESSION_LIST_UNSUBSCRIBE_METHOD,
  SESSION_RENAME_METHOD,
  SESSION_STEERING_METHOD,
  SESSION_UNARCHIVE_METHOD,
  SessionListSubscribeResponse,
  SessionRenameRequest,
  SessionSteeringRequest,
  SessionSteeringResponse,
} from './schema/agent.ts';

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

  it('_session/archive and _session/unarchive stay off the stable AgentRequestRpcs allowlist', () => {
    assert.strictEqual(tagsOf(AgentRequestRpcs).has(SESSION_ARCHIVE_METHOD), false);
    assert.strictEqual(tagsOf(AgentRequestRpcs).has(SESSION_UNARCHIVE_METHOD), false);
    assertExactTags(UnstableSessionArchiveRpcs, [SESSION_ARCHIVE_METHOD, SESSION_UNARCHIVE_METHOD]);
  });
});

describe('_session/rename', () => {
  it('stays off the stable AgentRequestRpcs allowlist', () => {
    assert.strictEqual(tagsOf(AgentRequestRpcs).has(SESSION_RENAME_METHOD), false);
    assertExactTags(UnstableSessionRenameRpcs, [SESSION_RENAME_METHOD]);
  });

  it('decodes sessionId and title', () => {
    const request = Schema.decodeUnknownSync(SessionRenameRequest)({ sessionId: 's1', title: 'New' });
    assert.strictEqual(request.title, 'New');
  });
});

describe('_session/steering', () => {
  it('stays off the stable AgentRequestRpcs allowlist', () => {
    assert.strictEqual(tagsOf(AgentRequestRpcs).has(SESSION_STEERING_METHOD), false);
    assertExactTags(UnstableSessionSteeringRpcs, [SESSION_STEERING_METHOD]);
  });

  it('encodes the request with idleBehavior in _meta.steering', () => {
    const request = Schema.decodeUnknownSync(SessionSteeringRequest)({
      _meta: { steering: { idleBehavior: 'promptRequired' } },
      prompt: [{ text: 'go left', type: 'text' }],
      sessionId: 's1',
    });
    assert.deepStrictEqual(Schema.encodeSync(SessionSteeringRequest)(request), {
      _meta: { steering: { idleBehavior: 'promptRequired' } },
      prompt: [{ text: 'go left', type: 'text' }],
      sessionId: 's1',
    });
  });

  it('decodes each response outcome and rejects unknown ones', () => {
    for (const response of [
      { outcome: 'injected' },
      { outcome: 'promptRequired', reason: 'noRunningTurn' },
      { outcome: 'startedNewTurn' },
    ] as const) {
      assert.deepStrictEqual(Schema.decodeUnknownSync(SessionSteeringResponse)(response), response);
    }
    assert.throws(() => Schema.decodeUnknownSync(SessionSteeringResponse)({ outcome: 'bogus' }));
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

describe('ListSessionsRequest metadata', () => {
  it('allows omitted metadata and validates AIR archived filters', () => {
    assert.deepStrictEqual(Schema.decodeSync(ListSessionsRequest)({}), {});

    for (const archived of ['unarchived', 'archived', 'all'] as const) {
      assert.deepStrictEqual(
        Schema.decodeSync(ListSessionsRequest)({
          _meta: { jetbrains: { air: { list: { archived }, version: 1 } } },
        }),
        { _meta: { jetbrains: { air: { list: { archived }, version: 1 } } } },
      );
    }

    const invalidRequest: unknown = {
      _meta: { jetbrains: { air: { list: { archived: 'not-archived' }, version: 1 } } },
    };
    assert.throws(() => Schema.decodeUnknownSync(ListSessionsRequest)(invalidRequest));
  });
});

describe('isAuthRequiredError', () => {
  it('accepts the auth_required code only', () => {
    assert.isTrue(isAuthRequiredError({ code: -32000, message: 'x' }));
    assert.isFalse(isAuthRequiredError({ code: -32603, message: 'Please sign in' }));
  });
});

describe('_session/list/subscribe', () => {
  it('stays off the stable AgentRequestRpcs allowlist', () => {
    assert.strictEqual(tagsOf(AgentRequestRpcs).has(SESSION_LIST_SUBSCRIBE_METHOD), false);
    assert.strictEqual(tagsOf(AgentRequestRpcs).has(SESSION_LIST_UNSUBSCRIBE_METHOD), false);
    assertExactTags(UnstableSessionListSubscribeRpcs, [SESSION_LIST_SUBSCRIBE_METHOD, SESSION_LIST_UNSUBSCRIBE_METHOD]);
    assert.strictEqual(SESSION_LIST_SUBSCRIBE_METHOD, '_session/list/subscribe');
    assert.strictEqual(SESSION_LIST_UNSUBSCRIBE_METHOD, '_session/list/unsubscribe');
  });

  it('decodes the subscription id', () => {
    const response = Schema.decodeUnknownSync(SessionListSubscribeResponse)({ subscriptionId: 'sub-1' });
    assert.strictEqual(response.subscriptionId, 'sub-1');
  });
});

describe('_session/list/changes', () => {
  it('is an Agent→Client notification kept off the stable ClientNotificationRpcs allowlist', () => {
    assert.strictEqual(tagsOf(ClientNotificationRpcs).has(SESSION_LIST_CHANGES_METHOD), false);
    assertExactTags(UnstableClientNotificationRpcs, [SESSION_LIST_CHANGES_METHOD]);
    assert.strictEqual(SESSION_LIST_CHANGES_METHOD, '_session/list/changes');
  });

  it('decodes rows with and without _meta, tolerating extra fields', () => {
    const payload = Schema.decodeUnknownSync(SessionListChangesNotificationPayload)({
      extra: 1,
      removed: ['gone'],
      sessions: [
        { _meta: { jetbrains: { air: { archived: true } } }, cwd: '/w', sessionId: 's1' },
        { sessionId: 's2' },
      ],
      subscriptionId: 'sub-1',
    });
    assert.strictEqual(payload.subscriptionId, 'sub-1');
    assert.deepStrictEqual(payload.removed, ['gone']);
    assert.strictEqual(payload.sessions.length, 2);
  });

  it('rejects a payload without a subscription id', () => {
    assert.throws(() => Schema.decodeUnknownSync(SessionListChangesNotificationPayload)({ removed: [], sessions: [] }));
  });
});
