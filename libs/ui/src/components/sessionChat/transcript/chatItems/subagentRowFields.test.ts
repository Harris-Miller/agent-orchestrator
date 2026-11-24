import { assert, describe, it } from '@effect/vitest';

import { CLAUDE, CODEX } from '../../../../atoms/fakeAgent.testing.ts';
import { configurationFromValues } from '../../../../host/configOptionIndexUi.ts';
import type { NormalizedConfigOption } from '../../../../host/acpSessionBootstrap.ts';
import { subagent } from '../../../../host/harnessSnapshot.testing.ts';
import { emptySessionTranscript, reduceSessionUpdate } from '../../../../host/sessionUpdateReducer.ts';
import type { SubagentSnapshot } from '../../../../host/subagent.ts';
import { subagentRowFields } from './subagentRowFields.ts';

const live: NormalizedConfigOption[] = [
  { choices: [{ id: 'opus', name: 'Opus' }], currentValue: 'opus', id: 'model', name: 'Model', type: 'select' },
  { choices: [{ id: 'high', name: 'High' }], currentValue: 'high', id: 'effort', name: 'Effort', type: 'select' },
];

const transcript = reduceSessionUpdate(emptySessionTranscript(), {
  content: { text: 'Done.', type: 'text' },
  sessionUpdate: 'agent_message_chunk',
});

describe('subagentRowFields', () => {
  it('is identical for a live spawned child and a Restored subagent with equal data', () => {
    const base = subagent('c1', 's1', { name: 'Worker', state: { state: 'completed' }, transcript });
    const liveChild: SubagentSnapshot = { ...base, kind: 'spawned', launchTarget: CLAUDE };
    const restored: SubagentSnapshot = {
      ...liveChild,
      restored: { config: { effort: 'high', model: 'opus' } },
    };
    const index = {
      byModel: { opus: live.map(option => ({ ...option, currentValue: undefined })) },
      defaultModelId: 'opus',
      unavailableModelIds: [],
    };
    const restoredConfiguration = configurationFromValues(index, { effort: 'high', model: 'opus' });
    const a = subagentRowFields(liveChild, CODEX, live);
    const b = subagentRowFields(restored, CODEX, restoredConfiguration);
    assert.deepStrictEqual(b, a);
    assert.strictEqual(a.modelEffort, 'Opus · High');
    assert.strictEqual(a.activity, 'Done.');
    assert.strictEqual(a.status, 'finished');
  });

  it('uses the parent launch target and a fallback name for a native child', () => {
    const fields = subagentRowFields(subagent('c1', 's1'), CODEX, undefined);
    assert.deepStrictEqual(fields.launchTarget, CODEX);
    assert.strictEqual(fields.name, 'Subagent');
    assert.isUndefined(fields.modelEffort);
  });
});
