import { assert, describe, it } from '@effect/vitest';
import { Cause } from 'effect';

import claudeSessionNewFixture from '../../../fixtures/claude_session_new_response.json';
import codexSessionNewFixture from '../../../fixtures/codex_session_new_response.json';
import { isRecord } from '../../utils.ts';

import {
  applySetConfigOptionResult,
  defectsFromActivationFailure,
  defectsFromCause,
  defectsFromWireCause,
  groupAndSortSessionsByCwd,
  normalizeModels,
  normalizeModes,
  normalizeSelectableConfigOptions,
  normalizeSessionInfoFromNew,
  patchConfigOptionValue,
  selectionFromSessionConfiguration,
} from './acpSessionBootstrap.ts';
import type { UnifiedRosterEntry } from './acpSessionBootstrap.ts';
import type { RpcWireEntry } from './agentHarness.ts';

const fixtureSessionValue = (fixture: unknown): unknown => {
  if (!isRecord(fixture) || !isRecord(fixture.message) || !isRecord(fixture.message.exit)) {
    return undefined;
  }
  const { exit } = fixture.message;
  if (exit._tag !== 'Success' || !isRecord(exit.value)) {
    return undefined;
  }
  return exit.value;
};

const claudeSession = fixtureSessionValue(claudeSessionNewFixture);
const codexSession = fixtureSessionValue(codexSessionNewFixture);

describe('normalizeModels', () => {
  it('reads model from configOptions (Claude fixture)', () => {
    const models = normalizeModels(claudeSession);
    assert.strictEqual(models.currentId, 'sonnet');
    assert.isTrue(models.options.some(option => option.id === 'sonnet'));
  });

  it('reads model from configOptions (Codex fixture)', () => {
    const models = normalizeModels(codexSession);
    assert.strictEqual(models.currentId, 'gpt-5.6-terra');
    assert.isTrue(models.options.some(option => option.id === 'gpt-5.6-terra'));
  });

  it('returns empty options when configOptions model is absent', () => {
    const models = normalizeModels({});
    assert.strictEqual(models.currentId, undefined);
    assert.strictEqual(models.options.length, 0);
  });
});

describe('normalizeModes', () => {
  it('reads mode from configOptions (Claude fixture)', () => {
    const modes = normalizeModes(claudeSession);
    assert.strictEqual(modes.currentId, 'default');
    assert.isTrue(modes.options.some(option => option.id === 'plan'));
  });

  it('reads mode from configOptions (Codex fixture)', () => {
    const modes = normalizeModes(codexSession);
    assert.strictEqual(modes.currentId, 'agent');
    assert.isTrue(modes.options.some(option => option.id === 'agent-full-access'));
  });

  it('returns empty options when configOptions mode is absent', () => {
    const modes = normalizeModes({});
    assert.strictEqual(modes.currentId, undefined);
    assert.strictEqual(modes.options.length, 0);
  });
});

describe('applySetConfigOptionResult', () => {
  it('merges partial config option updates while preserving choices', () => {
    const sessionState = {
      configOptions: [
        {
          currentValue: 'old-model',
          id: 'model',
          name: 'Model',
          options: [
            { name: 'Echo Model', value: 'echo-model' },
            { name: 'Echo Model (verbose)', value: 'echo-model-verbose' },
          ],
        },
        {
          currentValue: 'old-mode',
          id: 'mode',
          name: 'Mode',
          options: [
            { name: 'Default', value: 'default' },
            { name: 'Fixture', value: 'fixture' },
          ],
        },
      ],
    };
    const result = {
      configOptions: [{ currentValue: 'echo-model-verbose', id: 'model', name: 'Model', type: 'select' }],
    };

    const applied = applySetConfigOptionResult(sessionState, result);
    const state = applied.sessionState as Record<string, unknown>;
    const configOptions = state.configOptions as readonly Record<string, unknown>[];

    assert.strictEqual(configOptions.length, 2);
    assert.strictEqual(configOptions[0].id, 'model');
    assert.strictEqual(configOptions[0].currentValue, 'echo-model-verbose');
    assert.strictEqual((configOptions[0].options as readonly unknown[]).length, 2);
    assert.strictEqual(configOptions[1].id, 'mode');
    assert.strictEqual(configOptions[1].currentValue, 'old-mode');
    assert.strictEqual(applied.selectedModelId, 'echo-model-verbose');
    assert.strictEqual(applied.selectedModeId, 'old-mode');
  });
});

describe('selectionFromSessionConfiguration', () => {
  it('derives model and mode selection from configOptions', () => {
    const selection = selectionFromSessionConfiguration(claudeSession);
    assert.strictEqual(selection.selectedModelId, 'sonnet');
    assert.strictEqual(selection.selectedModeId, 'default');
  });
});

describe('normalizeSelectableConfigOptions', () => {
  it('keeps select options in agent order (Codex fixture)', () => {
    const options = normalizeSelectableConfigOptions(codexSession);
    assert.deepStrictEqual(
      options.map(option => option.id),
      ['mode', 'collaboration_mode', 'model', 'reasoning_effort', 'fast-mode'],
    );
  });

  it('keeps select options in agent order (Claude fixture)', () => {
    const options = normalizeSelectableConfigOptions(claudeSession);
    assert.deepStrictEqual(
      options.map(option => option.id),
      ['mode', 'model', 'effort'],
    );
  });

  it('returns empty options when configOptions are absent', () => {
    assert.deepStrictEqual(normalizeSelectableConfigOptions({}), []);
  });

  it('skips non-select options and options without choices', () => {
    const options = normalizeSelectableConfigOptions({
      configOptions: [
        { currentValue: true, id: 'brave', name: 'Brave', type: 'boolean' },
        { currentValue: 'a', id: 'empty', name: 'Empty', options: [], type: 'select' },
        {
          currentValue: 'a',
          id: 'kept',
          name: 'Kept',
          options: [{ name: 'A', value: 'a' }],
          type: 'select',
        },
      ],
    });
    assert.deepStrictEqual(
      options.map(option => option.id),
      ['kept'],
    );
  });
});

describe('patchConfigOptionValue', () => {
  it('updates currentValue without dropping options', () => {
    const sessionState = {
      configOptions: [
        {
          currentValue: 'old-model',
          id: 'model',
          name: 'Model',
          options: [
            { name: 'Echo Model', value: 'echo-model' },
            { name: 'Echo Model (verbose)', value: 'echo-model-verbose' },
          ],
        },
      ],
    };

    const patched = patchConfigOptionValue(sessionState, 'model', 'echo-model-verbose') as Record<string, unknown>;
    const configOptions = patched.configOptions as readonly Record<string, unknown>[];

    assert.strictEqual(configOptions[0].currentValue, 'echo-model-verbose');
    assert.strictEqual((configOptions[0].options as readonly unknown[]).length, 2);
  });
});

describe('normalizeSessionInfoFromNew', () => {
  it('stamps updatedAt from Date.now when session/new omits it', () => {
    const before = Date.now();
    const entry = normalizeSessionInfoFromNew({ sessionId: 's1' }, '/tmp/proj');
    const after = Date.now();

    assert.isDefined(entry);
    assert.strictEqual(entry.sessionId, 's1');
    assert.strictEqual(entry.cwd, '/tmp/proj');
    assert.isDefined(entry.updatedAt);
    const stamped = Date.parse(entry.updatedAt);
    assert.isTrue(stamped >= before && stamped <= after);
  });

  it('keeps server updatedAt when present', () => {
    const entry = normalizeSessionInfoFromNew({ sessionId: 's1', updatedAt: '2024-01-01T00:00:00.000Z' }, '/tmp/proj');
    assert.isDefined(entry);
    assert.strictEqual(entry.updatedAt, '2024-01-01T00:00:00.000Z');
  });
});

describe('groupAndSortSessionsByCwd', () => {
  it('groups by cwd, sorts sessions and groups by updatedAt desc, missing last', () => {
    const roster: readonly UnifiedRosterEntry[] = [
      { backend: 'echo', cwd: '/old', sessionId: 'a', updatedAt: '2024-01-01T00:00:00.000Z' },
      { backend: 'codex-acp', cwd: '/new', sessionId: 'b', updatedAt: '2024-06-01T00:00:00.000Z' },
      { backend: 'claude-agent-acp', cwd: '/new', sessionId: 'c', updatedAt: '2024-03-01T00:00:00.000Z' },
      { backend: 'echo', cwd: '/new', sessionId: 'd' },
      { backend: 'echo', cwd: '/mid', sessionId: 'e', updatedAt: '2024-02-01T00:00:00.000Z' },
    ];

    const groups = groupAndSortSessionsByCwd(roster);
    assert.deepStrictEqual(
      groups.map(group => group.cwd),
      ['/new', '/mid', '/old'],
    );
    assert.deepStrictEqual(
      groups[0].sessions.map(entry => entry.sessionId),
      ['b', 'c', 'd'],
    );
  });

  it('tie-breaks equal updatedAt by sessionId', () => {
    const roster: readonly UnifiedRosterEntry[] = [
      { backend: 'echo', cwd: '/x', sessionId: 'z', updatedAt: '2024-01-01T00:00:00.000Z' },
      { backend: 'echo', cwd: '/x', sessionId: 'a', updatedAt: '2024-01-01T00:00:00.000Z' },
    ];

    const groups = groupAndSortSessionsByCwd(roster);
    assert.deepStrictEqual(
      groups[0].sessions.map(entry => entry.sessionId),
      ['a', 'z'],
    );
  });
});

describe('defectsFromCause', () => {
  it('collects Die defects and ignores Fail reasons', () => {
    const defect = {
      code: -32603,
      data: { details: 'thread already has an active writer' },
      message: 'Internal error',
    };
    const cause = Cause.die(defect).pipe(Cause.combine(Cause.fail('typed')), Cause.combine(Cause.die({ code: 2 })));
    assert.deepStrictEqual(defectsFromCause(cause), [defect, { code: 2 }]);
  });
});

describe('defectsFromActivationFailure', () => {
  it('prefers wire cause[].defect over Schema.Defect-decoded Errors', () => {
    const wireDefect = {
      code: -32603,
      data: { details: 'thread already has an active writer' },
      message: 'Internal error',
    };
    const rpcCalls: readonly RpcWireEntry[] = [
      {
        direction: 'in',
        id: '1',
        message: {
          _tag: 'Exit',
          exit: { _tag: 'Failure', cause: [{ _tag: 'Die', defect: wireDefect }] },
          requestId: 6,
        },
      },
    ];
    const cause = Cause.die(new Error('Internal error'));
    assert.deepStrictEqual(defectsFromActivationFailure(rpcCalls, cause), [wireDefect]);
  });

  it('falls back to Cause Die defects when wire has none', () => {
    const defect = { code: 2 };
    assert.deepStrictEqual(defectsFromActivationFailure([], Cause.die(defect)), [defect]);
  });
});

describe('defectsFromWireCause', () => {
  it('reads Die defects from a wire cause array', () => {
    assert.deepStrictEqual(
      defectsFromWireCause([
        { _tag: 'Die', defect: { message: 'Internal error' } },
        { _tag: 'Fail', error: 'x' },
      ]),
      [{ message: 'Internal error' }],
    );
  });
});
