import { assert, describe, it } from '@effect/vitest';
import { APP_SESSION_ID_ATTRIBUTE } from '@lib/context-services';
import {
  ACP_CHILD_SESSION_ID,
  ACP_FORK_SOURCE_SESSION_ID,
  ACP_FORKED_SESSION_ID,
  ACP_LAUNCH_TARGET,
  ACP_PARENT_SESSION_ID,
  ACP_SESSION_ID,
  APP_SESSION_ID,
  HUB_CLIENT_KIND,
  sessionAttributes,
} from '@lib/hub/telemetryKeys';

describe('telemetry keys', () => {
  it('the app session key is the same in @lib/context-services and @lib/hub', () => {
    assert.strictEqual(APP_SESSION_ID_ATTRIBUTE, APP_SESSION_ID);
  });

  it('follows one convention: dot-separated lowercase namespaces, snake_case leaves', () => {
    for (const key of [
      ACP_CHILD_SESSION_ID,
      ACP_FORKED_SESSION_ID,
      ACP_FORK_SOURCE_SESSION_ID,
      ACP_LAUNCH_TARGET,
      ACP_PARENT_SESSION_ID,
      ACP_SESSION_ID,
      APP_SESSION_ID,
      HUB_CLIENT_KIND,
    ]) {
      assert.match(key, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    }
  });

  it('sessionAttributes names the launch target, the session and (a Spawned subagent session) its parent', () => {
    assert.deepStrictEqual(sessionAttributes('codex-acp', 's1'), {
      'acp.launch_target': 'codex-acp',
      'acp.session.id': 's1',
    });
    assert.deepStrictEqual(sessionAttributes('codex-acp', 's1', 'p1'), {
      'acp.launch_target': 'codex-acp',
      'acp.session.id': 's1',
      'acp.session.parent_id': 'p1',
    });
  });
});
