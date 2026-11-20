import { assert, describe, it } from '@effect/vitest';

import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import { NO_AGENT_CAPABILITIES } from './agentCapabilities.ts';
import { harness, permission, session, subagent } from './harnessSnapshot.testing.ts';
import { selectIdleSessions } from './idleSessions.ts';
import type { SubagentSnapshot } from './subagent.ts';

const NOW = Date.parse('2026-01-01T01:00:00.000Z');
const THRESHOLD = 10 * 60_000;
const IDLE_AT = new Date(NOW - THRESHOLD - 1).toISOString();

const closable = { ...NO_AGENT_CAPABILITIES, sessionClose: true };

const withRow = (
  snapshot: BackendHarnessSnapshot,
  updatedAt: string | null = IDLE_AT,
  sessionId = 'a',
): BackendHarnessSnapshot => ({
  ...snapshot,
  agentCapabilities: closable,
  sessionHistory: [{ cwd: '/proj', sessionId, ...(updatedAt === null ? {} : { updatedAt }) }],
});

const select = (
  snapshot: BackendHarnessSnapshot,
  options: { readonly handoffInProgress?: boolean; readonly selectedSessionId?: string } = {},
) =>
  selectIdleSessions({
    handoffInProgress: options.handoffInProgress ?? false,
    now: NOW,
    selectedSessionId: options.selectedSessionId,
    snapshot,
    thresholdMs: THRESHOLD,
  });

const spawned = (sessionId: string, parentSessionId: string, state?: string): SubagentSnapshot => ({
  ...subagent(sessionId, parentSessionId, state === undefined ? {} : { state: { state } }),
  kind: 'spawned',
  launchTarget: 'claude-agent-acp',
});

describe('selectIdleSessions', () => {
  it('closes an active session idle past the threshold', () => {
    assert.deepStrictEqual(select(withRow(harness([session('a')]))), ['a']);
  });

  it('keeps a session idle exactly at the threshold or less', () => {
    const atThreshold = new Date(NOW - THRESHOLD).toISOString();
    assert.deepStrictEqual(select(withRow(harness([session('a')]), atThreshold)), []);
  });

  it('keeps a session without updatedAt', () => {
    assert.deepStrictEqual(select(withRow(harness([session('a')]), null)), []);
  });

  it('keeps the Selected session', () => {
    assert.deepStrictEqual(select(withRow(harness([session('a')])), { selectedSessionId: 'a' }), []);
  });

  it('keeps a session with an in-flight Prompt turn, also while blocked on a pending permission', () => {
    assert.deepStrictEqual(select(withRow(harness([session('a', { pendingClientRequest: 'prompt' })]))), []);
    assert.deepStrictEqual(
      select(withRow(harness([session('a', { pendingClientRequest: 'prompt', pendingPermission: permission('a') })]))),
      [],
    );
  });

  it('keeps a session with a running or requires_action native subagent', () => {
    for (const state of ['running', 'requires_action']) {
      assert.deepStrictEqual(select(withRow(harness([session('a')], [subagent('c', 'a', { state: { state } })]))), []);
    }
  });

  it('keeps a session with a running or requires_action spawned subagent mirror', () => {
    for (const state of ['running', 'requires_action']) {
      assert.deepStrictEqual(select(withRow(harness([session('a')], [spawned('c', 'a', state)]))), []);
    }
  });

  it('closes a session whose only subagents are finished or stateUnconfirmed', () => {
    const subagents = [
      spawned('c1', 'a', 'completed'),
      { ...subagent('c2', 'a'), stateUnconfirmed: true as const },
      spawned('c3', 'a'),
    ];
    assert.deepStrictEqual(select(withRow(harness([session('a')], subagents))), ['a']);
  });

  it('keeps activating and inactive sessions', () => {
    for (const status of ['activating', 'inactive'] as const) {
      assert.deepStrictEqual(select(withRow(harness([session('a', { status })]))), []);
    }
  });

  it('keeps a session with no History row', () => {
    assert.deepStrictEqual(select(withRow(harness([session('a')]), IDLE_AT, 'other')), []);
  });

  it('keeps everything when the launch target does not advertise close', () => {
    assert.deepStrictEqual(
      select({ ...withRow(harness([session('a')])), agentCapabilities: NO_AGENT_CAPABILITIES }),
      [],
    );
  });

  it('keeps everything while a Handoff is in progress', () => {
    assert.deepStrictEqual(select(withRow(harness([session('a')])), { handoffInProgress: true }), []);
  });
});
