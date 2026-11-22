import { assert, describe, it } from '@effect/vitest';

import type { AcpTelemetry } from './acpTelemetry.ts';
import {
  elicitationTelemetry,
  permissionTelemetry,
  promptResponseTelemetry,
  sessionUpdateTelemetry,
  summarizeSessionUpdate,
} from './acpTelemetry.ts';

/** Planted in every free-text field: no projection may ever emit it. */
const CANARY = 'CANARY_7f3a';

const plain = (attributes: AcpTelemetry): Readonly<Record<string, unknown>> => ({ ...attributes });

const assertNoCanary = (value: unknown) => {
  assert.notInclude(JSON.stringify(value), CANARY);
};

const sessionUpdates = [
  { content: { text: `${CANARY} hello`, type: 'text' }, sessionUpdate: 'agent_message_chunk' },
  { content: { text: CANARY, type: 'text' }, sessionUpdate: 'agent_thought_chunk' },
  { content: { text: CANARY, type: 'text' }, sessionUpdate: 'user_message_chunk' },
  { content: { data: CANARY, mimeType: 'image/png', type: 'image' }, sessionUpdate: 'agent_message_chunk' },
  { content: { name: CANARY, type: 'resource_link', uri: `file:///${CANARY}` }, sessionUpdate: 'user_message_chunk' },
  {
    content: [{ content: { text: CANARY, type: 'text' }, type: 'content' }],
    kind: 'execute',
    locations: [{ path: `/home/${CANARY}` }],
    rawInput: { command: `rm -rf ${CANARY}` },
    sessionUpdate: 'tool_call',
    status: 'pending',
    title: `Run ${CANARY}`,
    toolCallId: 'call_1',
  },
  {
    content: [{ newText: CANARY, oldText: CANARY, path: CANARY, type: 'diff' }],
    rawOutput: { stdout: CANARY },
    sessionUpdate: 'tool_call_update',
    status: 'completed',
    title: CANARY,
    toolCallId: 'call_1',
  },
  { entries: [{ content: CANARY, priority: 'high', status: 'pending' }], sessionUpdate: 'plan' },
  { sessionUpdate: 'session_info_update', title: CANARY },
  { availableCommands: [{ description: CANARY, name: CANARY }], sessionUpdate: 'available_commands_update' },
  { currentModeId: CANARY, sessionUpdate: 'current_mode_update' },
  { sessionUpdate: CANARY },
  { kind: CANARY, sessionUpdate: 'tool_call', status: CANARY, toolCallId: CANARY.repeat(20) },
  { content: { text: CANARY, type: 'text' }, sessionUpdate: 'session_message_chunk' },
  { sessionUpdate: 'usage_update', size: 100, used: 10, note: CANARY },
  { configOptions: [{ currentValue: CANARY, id: 'model', name: CANARY }], sessionUpdate: 'config_option_update' },
  {
    content: [{ terminalId: CANARY, type: 'terminal' }],
    sessionUpdate: 'tool_call_update',
    status: 'in_progress',
    toolCallId: 'call_3',
  },
];

describe('summarizeSessionUpdate', () => {
  it('never emits free text from any session update', () => {
    for (const update of sessionUpdates) {
      const summary = summarizeSessionUpdate(update);
      assertNoCanary(summary);
      assertNoCanary(sessionUpdateTelemetry(summary));
    }
  });

  it('keeps tool call id, kind, status and location count', () => {
    assert.deepStrictEqual(summarizeSessionUpdate(sessionUpdates[5]), {
      kind: 'tool_call',
      locations: 1,
      toolCallId: 'call_1',
      toolKind: 'execute',
      toolStatus: 'pending',
    });
  });

  it('keeps chunk content type and text length', () => {
    assert.deepStrictEqual(summarizeSessionUpdate(sessionUpdates[0]), {
      contentType: 'text',
      kind: 'agent_message_chunk',
      textChars: CANARY.length + 6,
    });
  });

  it('maps an unknown discriminator to unrecognized and drops an oversized id', () => {
    assert.deepStrictEqual(summarizeSessionUpdate(sessionUpdates[12]), {
      kind: 'tool_call',
      toolKind: 'unrecognized',
      toolStatus: 'unrecognized',
    });
    assert.deepStrictEqual(summarizeSessionUpdate(sessionUpdates[11]), { kind: 'unrecognized' });
  });

  it('builds span attributes from a summary', () => {
    assert.deepStrictEqual(plain(sessionUpdateTelemetry(summarizeSessionUpdate(sessionUpdates[7]))), {
      'acp.plan.entries': 1,
      'acp.update': 'plan',
    });
  });
});

const permissionRequest = {
  options: [
    { kind: 'allow_once', name: `Allow ${CANARY}`, optionId: `opt-${CANARY}-1` },
    { kind: 'reject_once', name: CANARY, optionId: `opt-${CANARY}-2` },
  ],
  sessionId: 's1',
  toolCall: { kind: 'edit', rawInput: CANARY, title: CANARY, toolCallId: 'call_2' },
};

describe('permissionTelemetry', () => {
  it('records offered and chosen option kinds, never names or ids', () => {
    const attributes = permissionTelemetry(permissionRequest, {
      outcome: { optionId: `opt-${CANARY}-2`, outcome: 'selected' },
    });
    assertNoCanary(attributes);
    assert.deepStrictEqual(plain(attributes), {
      'acp.permission.options': 'allow_once,reject_once',
      'acp.permission.outcome': 'selected',
      'acp.permission.selected': 'reject_once',
      'acp.tool.kind': 'edit',
      'acp.toolCallId': 'call_2',
    });
  });

  it('records a cancelled outcome', () => {
    assert.strictEqual(
      permissionTelemetry(permissionRequest, { outcome: { outcome: 'cancelled' } })['acp.permission.outcome'],
      'cancelled',
    );
  });
});

describe('elicitationTelemetry', () => {
  it('records mode and action, never message or answers', () => {
    const attributes = elicitationTelemetry(
      { message: CANARY, mode: 'form', requestedSchema: { properties: { [CANARY]: { type: 'string' } } } },
      { action: 'accept', content: { [CANARY]: CANARY } },
    );
    assertNoCanary(attributes);
    assertNoCanary(
      elicitationTelemetry({ message: CANARY, mode: 'url', url: `https://${CANARY}` }, { action: CANARY }),
    );
    assert.deepStrictEqual(plain(attributes), { 'acp.elicitation.action': 'accept', 'acp.elicitation.mode': 'form' });
  });
});

describe('promptResponseTelemetry', () => {
  it('records stop reason and numeric token counts only', () => {
    assert.deepStrictEqual(
      plain(
        promptResponseTelemetry({ stopReason: 'end_turn', usage: { inputTokens: 10, note: CANARY, outputTokens: 4 } }),
      ),
      { 'acp.stopReason': 'end_turn', 'acp.usage.inputTokens': 10, 'acp.usage.outputTokens': 4 },
    );
  });
});
