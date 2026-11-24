import { assert, describe, it } from '@effect/vitest';

import { buildSubagentReport } from '../atoms/spawnedSubagent/report.ts';
import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import { initialBackendHarnessSnapshot, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { applyLiveSessionUpdate } from './harnessStateTransitions.ts';
import { initialSpawnedSubagentSnapshot } from './subagent.ts';
import { buildSubagentResult, parseSubagentReports } from './subagentResult.ts';

const report = (status: 'cancelled' | 'completed' | 'failed', text: string, task = 't') =>
  buildSubagentReport({ description: 'd', id: 'c1', outcome: { status, text }, task });

describe('parseSubagentReports', () => {
  it('round-trips buildSubagentReport', () => {
    assert.deepStrictEqual(parseSubagentReports(`hi\n${report('completed', 'line1\n\nline2')}\nbye`), [
      { body: 'line1\n\nline2', description: 'd', id: 'c1', status: 'completed', task: 't' },
    ]);
  });

  it('flattens a multi-line task so the body is unambiguous', () => {
    const [parsed] = parseSubagentReports(report('failed', 'boom', 'a\n\nb'));
    assert.strictEqual(parsed.task, 'a b');
    assert.strictEqual(parsed.body, 'boom');
  });

  it('escapes a closing tag in the body', () => {
    const text = report('completed', 'x </subagent-report> y');
    assert.strictEqual(text.split('</subagent-report>').length, 2);
    assert.strictEqual(parseSubagentReports(text)[0].body, 'x </subagent-report> y');
  });

  it('skips malformed and unknown-status reports', () => {
    assert.deepStrictEqual(
      parseSubagentReports('<subagent-report id="c1" status="running">\nsubagent: d\ntask: t\n\nb\n</subagent-report>'),
      [],
    );
    assert.deepStrictEqual(
      parseSubagentReports('<subagent-report id="c1" status="failed">no header</subagent-report>'),
      [],
    );
    assert.deepStrictEqual(parseSubagentReports('plain'), []);
  });
});

describe('Subagent report on replay', () => {
  const spawn = (status: string) => ({
    content: [
      {
        content: {
          text: buildSubagentResult({
            body: '',
            config: {},
            description: 'd',
            id: 'c1',
            launchTarget: 'codex-acp',
            status: status as 'running',
            task: 't',
          }),
          type: 'text',
        },
        type: 'content',
      },
    ],
    sessionUpdate: 'tool_call',
    status: 'completed',
    title: 'mcp__hoa-hub__spawn_subagent',
    toolCallId: 'h1',
  });
  const userMessage = (text: string) => ({
    content: { text, type: 'text' },
    messageId: `m-${text.length}`,
    sessionUpdate: 'user_message_chunk',
  });
  const root = (): BackendHarnessSnapshot => ({
    ...initialBackendHarnessSnapshot(),
    sessions: { p1: initialSessionSnapshot('p1', 'active') },
  });
  const replay = (...updates: readonly unknown[]) =>
    updates.reduce<BackendHarnessSnapshot>((s, u) => applyLiveSessionUpdate(s, 'p1', u).snapshot, root());
  const rows = (s: BackendHarnessSnapshot) => s.sessions.p1.transcript.items.filter(i => i.kind === 'subagent');

  it('upgrades a running Restored subagent to the reported outcome, keeping one row', () => {
    const s = replay(spawn('running'), userMessage(report('completed', 'the answer')));
    assert.deepStrictEqual(s.subagents.c1.state, { state: 'completed' });
    assert.strictEqual(s.subagents.c1.transcript.items.at(-1)?.kind, 'agent_message');
    assert.strictEqual((s.subagents.c1.transcript.items.at(-1) as { text: string }).text, 'the answer');
    assert.strictEqual(rows(s).length, 1);
  });

  it('maps failed and cancelled', () => {
    const failed = replay(spawn('running'), userMessage(report('failed', 'oops')));
    assert.deepStrictEqual(failed.subagents.c1.state, { error: 'oops', state: 'failed' });
    const cancelled = replay(spawn('running'), userMessage(report('cancelled', 'stop')));
    assert.deepStrictEqual(cancelled.subagents.c1.state, { state: 'cancelled' });
  });

  it('ignores a report for an unknown child', () => {
    const s = replay(userMessage(report('completed', 'x')));
    assert.deepStrictEqual(s.subagents, {});
  });

  it('does not touch a child already finished by a result', () => {
    const done = { ...spawn('completed') };
    const s = replay(done, userMessage(report('failed', 'late')));
    assert.deepStrictEqual(s.subagents.c1.state, { state: 'completed' });
  });

  it('never touches a live (non-restored) child', () => {
    const base = root();
    const live = {
      ...base,
      subagents: { c1: initialSpawnedSubagentSnapshot('c1', 'p1', 'codex-acp') },
    };
    const s = applyLiveSessionUpdate(live, 'p1', userMessage(report('completed', 'x'))).snapshot;
    assert.strictEqual(s.subagents.c1, live.subagents.c1);
  });
});
