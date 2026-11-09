import { assert, describe, it } from '@effect/vitest';
import { Cause } from 'effect';

import claudeSessionNewFixture from '../../fixtures/claude_session_new_response.json';
import codexSessionNewFixture from '../../fixtures/codex_session_new_response.json';
import { isRecord } from '../isRecord.ts';

import {
  applySessionInfoTitle,
  compareHistoryEntries,
  defectsFromActivationFailure,
  defectsFromCause,
  defectsFromWireCause,
  isConfigProbeCwd,
  normalizeConfigOptions,
  normalizeModels,
  normalizeSessionHistory,
  normalizeSessionInfo,
  normalizeSessionInfoFromNew,
  recentSessionsForCwd,
  resolveSessionCwd,
  sessionsForCwd,
} from './acpSessionBootstrap.ts';
import type { UnifiedHistoryEntry } from './acpSessionBootstrap.ts';
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

describe('resolveSessionCwd', () => {
  it('prefers non-empty snapshot cwd over history', () => {
    assert.strictEqual(resolveSessionCwd('/snap', '/history'), '/snap');
  });

  it('falls back to history cwd when snapshot missing', () => {
    assert.strictEqual(resolveSessionCwd(undefined, '/history'), '/history');
  });

  it('returns undefined when both missing', () => {
    assert.strictEqual(resolveSessionCwd(undefined, undefined), undefined);
  });

  it('treats empty and whitespace cwd as missing', () => {
    assert.strictEqual(resolveSessionCwd('', '/history'), '/history');
    assert.strictEqual(resolveSessionCwd('   ', '/history'), '/history');
    assert.strictEqual(resolveSessionCwd('/snap', ''), '/snap');
    assert.strictEqual(resolveSessionCwd('/snap', '  '), '/snap');
    assert.strictEqual(resolveSessionCwd('', ''), undefined);
    assert.strictEqual(resolveSessionCwd('  ', undefined), undefined);
  });
});

describe('applySessionInfoTitle', () => {
  it('updates title on the matching sessionId only', () => {
    const history = [
      { cwd: '/a', sessionId: 's1', title: 'Old' },
      { cwd: '/b', sessionId: 's2', title: 'Other' },
    ] as const;

    assert.deepStrictEqual(applySessionInfoTitle(history, 's1', 'Implement auth'), [
      { cwd: '/a', sessionId: 's1', title: 'Implement auth' },
      { cwd: '/b', sessionId: 's2', title: 'Other' },
    ]);
  });
});

describe('isConfigProbeCwd / normalizeSessionHistory', () => {
  it('detects Config probe temp cwd basename', () => {
    assert.isTrue(isConfigProbeCwd('/tmp/hoa-config-probe-abc'));
    assert.isTrue(isConfigProbeCwd('C:\\Users\\x\\AppData\\Local\\Temp\\hoa-config-probe-abc'));
    assert.isFalse(isConfigProbeCwd('/Users/harris/Projects/agent-orchestrator'));
    assert.isFalse(isConfigProbeCwd('/tmp/hoa-config-probe'));
  });

  it('drops Config probe sessions from history normalization', () => {
    assert.strictEqual(normalizeSessionInfo({ cwd: '/tmp/hoa-config-probe-abc', sessionId: 'probe' }), undefined);
    assert.deepStrictEqual(
      normalizeSessionHistory({
        sessions: [
          { cwd: '/tmp/hoa-config-probe-abc', sessionId: 'probe' },
          {
            _meta: { jetbrains: { air: { archived: false } } },
            cwd: '/proj',
            sessionId: 'real',
            title: 'Real',
            updatedAt: '2026-10-30T12:00:00.000Z',
          },
        ],
      }),
      [
        {
          _meta: { jetbrains: { air: { archived: false } } },
          cwd: '/proj',
          sessionId: 'real',
          title: 'Real',
          updatedAt: '2026-10-30T12:00:00.000Z',
        },
      ],
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

describe('sessionsForCwd', () => {
  it('returns the entries for cwd newest first, missing updatedAt last; empty when none', () => {
    const history: readonly UnifiedHistoryEntry[] = [
      { cwd: '/old', launchTarget: 'antigravity-acp', sessionId: 'a', updatedAt: '2024-01-01T00:00:00.000Z' },
      { cwd: '/new', launchTarget: 'codex-acp', sessionId: 'b', updatedAt: '2024-06-01T00:00:00.000Z' },
      { cwd: '/new', launchTarget: 'claude-agent-acp', sessionId: 'c', updatedAt: '2024-03-01T00:00:00.000Z' },
      { cwd: '/new', launchTarget: 'antigravity-acp', sessionId: 'd' },
    ];

    assert.deepStrictEqual(
      sessionsForCwd(history, '/new').map(entry => entry.sessionId),
      ['b', 'c', 'd'],
    );
    assert.deepStrictEqual(sessionsForCwd(history, '/missing'), []);
    assert.deepStrictEqual(sessionsForCwd(history, undefined), []);
  });

  it('tie-breaks equal updatedAt by sessionId', () => {
    const history: readonly UnifiedHistoryEntry[] = [
      { cwd: '/x', launchTarget: 'codex-acp', sessionId: 'z', updatedAt: '2024-01-01T00:00:00.000Z' },
      { cwd: '/x', launchTarget: 'codex-acp', sessionId: 'a', updatedAt: '2024-01-01T00:00:00.000Z' },
    ];

    assert.deepStrictEqual(
      sessionsForCwd(history, '/x').map(entry => entry.sessionId),
      ['a', 'z'],
    );
  });
});

describe('recentSessionsForCwd', () => {
  it('lists the newest unarchived entries for cwd, never archived ones', () => {
    const archived = { _meta: { jetbrains: { air: { archived: true } } } };
    const history: readonly UnifiedHistoryEntry[] = [
      { ...archived, cwd: '/x', launchTarget: 'codex-acp', sessionId: 'archived', updatedAt: '2024-09-01T00:00:00Z' },
      { cwd: '/x', launchTarget: 'codex-acp', sessionId: 'a', updatedAt: '2024-03-01T00:00:00Z' },
      { cwd: '/x', launchTarget: 'codex-acp', sessionId: 'b', updatedAt: '2024-02-01T00:00:00Z' },
      { cwd: '/x', launchTarget: 'codex-acp', sessionId: 'c', updatedAt: '2024-01-01T00:00:00Z' },
      { cwd: '/y', launchTarget: 'codex-acp', sessionId: 'other', updatedAt: '2024-05-01T00:00:00Z' },
    ];

    assert.deepStrictEqual(
      recentSessionsForCwd(history, '/x', 2).map(entry => entry.sessionId),
      ['a', 'b'],
    );
  });
});

describe('compareHistoryEntries', () => {
  it('puts unarchived rows before archived ones, each newest updatedAt first', () => {
    const archived = { _meta: { jetbrains: { air: { archived: true } } } };
    const history: readonly UnifiedHistoryEntry[] = [
      {
        ...archived,
        cwd: '/x',
        launchTarget: 'codex-acp',
        sessionId: 'old-archived',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      { cwd: '/x', launchTarget: 'codex-acp', sessionId: 'old', updatedAt: '2024-02-01T00:00:00Z' },
      {
        ...archived,
        cwd: '/x',
        launchTarget: 'codex-acp',
        sessionId: 'new-archived',
        updatedAt: '2024-09-01T00:00:00Z',
      },
      { cwd: '/x', launchTarget: 'codex-acp', sessionId: 'new', updatedAt: '2024-03-01T00:00:00Z' },
    ];

    assert.deepStrictEqual(
      [...history].sort(compareHistoryEntries).map(entry => entry.sessionId),
      ['new', 'old', 'new-archived', 'old-archived'],
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
