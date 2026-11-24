import { assert, describe, it } from '@effect/vitest';
import * as telemetryKeys from '@lib/hub/telemetryKeys';
import { HUB_OUTCOME, HUB_TOOL, sessionAttributes } from '@lib/hub/telemetryKeys';

describe('telemetry keys', () => {
  it('every exported key follows one convention: dot-separated lowercase namespaces, snake_case leaves', () => {
    const keys: [string, string][] = [];
    for (const [name, value] of Object.entries(telemetryKeys)) {
      if (typeof value === 'string') {
        keys.push([name, value]);
      }
    }
    assert.isAbove(keys.length, 20);
    assert.isTrue(keys.some(([, key]) => key === HUB_TOOL) && keys.some(([, key]) => key === HUB_OUTCOME));
    for (const [name, key] of keys) {
      assert.match(key, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, name);
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
