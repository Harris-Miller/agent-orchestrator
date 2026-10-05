import { assert, describe, it } from '@effect/vitest';
import { Cause } from 'effect';

import claudeSessionNewFixture from '../../fixtures/claude_session_new_response.json';
import codexSessionNewFixture from '../../fixtures/codex_session_new_response.json';
import { isRecord } from '../isRecord.ts';

import {
  applySessionInfoTitle,
  applySetConfigOptionResult,
  defectsFromActivationFailure,
  defectsFromCause,
  defectsFromWireCause,
  groupAndSortSessionsByCwd,
  isConfigProbeCwd,
  normalizeConfigOptions,
  normalizeModels,
  normalizeModes,
  normalizeSelectableConfigOptions,
  normalizeSessionInfo,
  normalizeSessionInfoFromNew,
  normalizeSessionRoster,
  patchConfigOptionValue,
  resolveSessionCwd,
  selectionFromSessionConfiguration,
  sessionsForCwd,
} from './acpSessionBootstrap.ts';
import type { UnifiedRosterEntry } from './acpSessionBootstrap.ts';
import type { RpcWireEntry } from './backendHarness.ts';

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
    const sessionConfiguration = {
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

    const applied = applySetConfigOptionResult(sessionConfiguration, result);
    const state = applied.sessionConfiguration as Record<string, unknown>;
    const configOptions = state.configOptions as readonly Record<string, unknown>[];

    assert.strictEqual(configOptions.length, 1);
    assert.strictEqual(configOptions[0].id, 'model');
    assert.strictEqual(configOptions[0].currentValue, 'echo-model-verbose');
    assert.strictEqual((configOptions[0].options as readonly unknown[]).length, 2);
    assert.strictEqual(applied.selectedModelId, 'echo-model-verbose');
    assert.strictEqual(applied.selectedModeId, undefined);
  });

  it('surfaces new option ids from the response with their currentValue', () => {
    const sessionConfiguration = {
      configOptions: [
        {
          currentValue: 'sonnet',
          id: 'model',
          name: 'Model',
          options: [{ name: 'Sonnet', value: 'sonnet' }],
        },
      ],
    };
    const result = {
      configOptions: [
        {
          currentValue: 'high',
          id: 'effort',
          name: 'Effort',
          options: [
            { name: 'Low', value: 'low' },
            { name: 'High', value: 'high' },
          ],
          type: 'select',
        },
      ],
    };

    const applied = applySetConfigOptionResult(sessionConfiguration, result);
    const state = applied.sessionConfiguration as Record<string, unknown>;
    const configOptions = state.configOptions as readonly Record<string, unknown>[];

    assert.strictEqual(configOptions.length, 1);
    assert.strictEqual(configOptions[0].id, 'effort');
    assert.strictEqual(configOptions[0].currentValue, 'high');
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

describe('normalizeConfigOptions', () => {
  it('keeps select and boolean in agent order and drops unknown types', () => {
    const options = normalizeConfigOptions({
      configOptions: [
        { currentValue: true, id: 'brave', name: 'Brave', type: 'boolean' },
        {
          currentValue: 'a',
          id: 'kept',
          name: 'Kept',
          options: [{ name: 'A', value: 'a' }],
          type: 'select',
        },
        { currentValue: 'x', id: 'future', name: 'Future', type: 'slider' },
      ],
    });
    assert.deepStrictEqual(
      options.map(option => ({ currentValue: option.currentValue, id: option.id, type: option.type })),
      [
        { currentValue: true, id: 'brave', type: 'boolean' },
        { currentValue: 'a', id: 'kept', type: 'select' },
      ],
    );
  });
});

describe('patchConfigOptionValue', () => {
  it('updates currentValue without dropping options', () => {
    const sessionConfiguration = {
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

    const patched = patchConfigOptionValue(sessionConfiguration, 'model', 'echo-model-verbose') as Record<
      string,
      unknown
    >;
    const configOptions = patched.configOptions as readonly Record<string, unknown>[];

    assert.strictEqual(configOptions[0].currentValue, 'echo-model-verbose');
    assert.strictEqual((configOptions[0].options as readonly unknown[]).length, 2);
  });

  it('updates boolean currentValue', () => {
    const sessionConfiguration = {
      configOptions: [{ currentValue: false, id: 'brave', name: 'Brave', type: 'boolean' }],
    };

    const patched = patchConfigOptionValue(sessionConfiguration, 'brave', true) as Record<string, unknown>;
    const configOptions = patched.configOptions as readonly Record<string, unknown>[];

    assert.strictEqual(configOptions[0].currentValue, true);
  });
});

describe('resolveSessionCwd', () => {
  it('prefers non-empty snapshot cwd over roster', () => {
    assert.strictEqual(resolveSessionCwd('/snap', '/roster'), '/snap');
  });

  it('falls back to roster cwd when snapshot missing', () => {
    assert.strictEqual(resolveSessionCwd(undefined, '/roster'), '/roster');
  });

  it('returns undefined when both missing', () => {
    assert.strictEqual(resolveSessionCwd(undefined, undefined), undefined);
  });

  it('treats empty and whitespace cwd as missing', () => {
    assert.strictEqual(resolveSessionCwd('', '/roster'), '/roster');
    assert.strictEqual(resolveSessionCwd('   ', '/roster'), '/roster');
    assert.strictEqual(resolveSessionCwd('/snap', ''), '/snap');
    assert.strictEqual(resolveSessionCwd('/snap', '  '), '/snap');
    assert.strictEqual(resolveSessionCwd('', ''), undefined);
    assert.strictEqual(resolveSessionCwd('  ', undefined), undefined);
  });
});

describe('applySessionInfoTitle', () => {
  it('updates title on the matching sessionId only', () => {
    const roster = [
      { cwd: '/a', sessionId: 's1', title: 'Old' },
      { cwd: '/b', sessionId: 's2', title: 'Other' },
    ] as const;

    assert.deepStrictEqual(applySessionInfoTitle(roster, 's1', 'Implement auth'), [
      { cwd: '/a', sessionId: 's1', title: 'Implement auth' },
      { cwd: '/b', sessionId: 's2', title: 'Other' },
    ]);
  });
});

describe('isConfigProbeCwd / normalizeSessionRoster', () => {
  it('detects Config probe temp cwd basename', () => {
    assert.isTrue(isConfigProbeCwd('/tmp/ao-config-probe-abc'));
    assert.isTrue(isConfigProbeCwd('C:\\Users\\x\\AppData\\Local\\Temp\\ao-config-probe-abc'));
    assert.isFalse(isConfigProbeCwd('/Users/harris/Projects/agent-orchestrator'));
    assert.isFalse(isConfigProbeCwd('/tmp/ao-config-probe'));
  });

  it('drops Config probe sessions from roster normalization', () => {
    assert.strictEqual(normalizeSessionInfo({ cwd: '/tmp/ao-config-probe-abc', sessionId: 'probe' }), undefined);
    assert.deepStrictEqual(
      normalizeSessionRoster({
        sessions: [
          { cwd: '/tmp/ao-config-probe-abc', sessionId: 'probe' },
          { cwd: '/proj', sessionId: 'real', title: 'Real' },
        ],
      }),
      [{ cwd: '/proj', sessionId: 'real', title: 'Real', updatedAt: undefined }],
    );
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
      { cwd: '/old', launchTarget: 'gemini-acp', sessionId: 'a', updatedAt: '2024-01-01T00:00:00.000Z' },
      { cwd: '/new', launchTarget: 'codex-acp', sessionId: 'b', updatedAt: '2024-06-01T00:00:00.000Z' },
      { cwd: '/new', launchTarget: 'claude-agent-acp', sessionId: 'c', updatedAt: '2024-03-01T00:00:00.000Z' },
      { cwd: '/new', launchTarget: 'gemini-acp', sessionId: 'd' },
      { cwd: '/mid', launchTarget: 'gemini-acp', sessionId: 'e', updatedAt: '2024-02-01T00:00:00.000Z' },
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
      { cwd: '/x', launchTarget: 'codex-acp', sessionId: 'z', updatedAt: '2024-01-01T00:00:00.000Z' },
      { cwd: '/x', launchTarget: 'codex-acp', sessionId: 'a', updatedAt: '2024-01-01T00:00:00.000Z' },
    ];

    const groups = groupAndSortSessionsByCwd(roster);
    assert.deepStrictEqual(
      groups[0].sessions.map(entry => entry.sessionId),
      ['a', 'z'],
    );
  });
});

describe('sessionsForCwd', () => {
  it('returns the matching cwd group in groupAndSort order; empty when missing', () => {
    const roster: readonly UnifiedRosterEntry[] = [
      { cwd: '/old', launchTarget: 'gemini-acp', sessionId: 'a', updatedAt: '2024-01-01T00:00:00.000Z' },
      { cwd: '/new', launchTarget: 'codex-acp', sessionId: 'b', updatedAt: '2024-06-01T00:00:00.000Z' },
      { cwd: '/new', launchTarget: 'claude-agent-acp', sessionId: 'c', updatedAt: '2024-03-01T00:00:00.000Z' },
      { cwd: '/new', launchTarget: 'gemini-acp', sessionId: 'd' },
    ];

    assert.deepStrictEqual(
      sessionsForCwd(roster, '/new').map(entry => entry.sessionId),
      ['b', 'c', 'd'],
    );
    assert.deepStrictEqual(sessionsForCwd(roster, '/missing'), []);
    assert.deepStrictEqual(sessionsForCwd(roster, undefined), []);
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
        receivedAt: 0,
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
