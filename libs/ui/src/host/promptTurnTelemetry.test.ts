import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import type { Tracer } from 'effect';

import type { SessionUpdateSummary } from './acpTelemetry.ts';
import {
  CANCEL_UNANSWERED_MS,
  closeOrphanedToolCalls,
  makePromptTurn,
  promptTurnSummary,
  recordAwaitingUser,
  recordCancelRequested,
  recordSessionUpdate,
  recordToolCall,
  SILENT_TURN_MS,
  takeDueTurnAlarms,
} from './promptTurnTelemetry.ts';

const turnAt = (nowMs: number) =>
  Effect.map(Effect.makeSpan('sendPrompt'), span => ({ span, turn: makePromptTurn(span, nowMs) }));

const chunk: SessionUpdateSummary = { contentType: 'text', kind: 'agent_message_chunk', textChars: 3 };

const endExit = (span: Tracer.Span): Exit.Exit<unknown, unknown> | undefined =>
  span.status._tag === 'Ended' ? span.status.exit : undefined;

describe('Prompt turn tally', () => {
  it.effect('records first update, first agent chunk, counts and the longest gap', () =>
    Effect.gen(function* () {
      const { turn } = yield* turnAt(1000);
      recordSessionUpdate(turn, { kind: 'plan', planEntries: 2 }, 1200);
      recordSessionUpdate(turn, chunk, 1500);
      recordSessionUpdate(turn, chunk, 4500);
      assert.deepStrictEqual(
        { ...promptTurnSummary(turn, 4600) },
        {
          'acp.turn.firstAgentChunkMs': 500,
          'acp.turn.firstUpdateMs': 200,
          'acp.turn.maxGapMs': 3000,
          'acp.turn.toolCalls': 0,
          'acp.turn.toolCalls.failed': 0,
          'acp.turn.toolCalls.orphaned': 0,
          'acp.turn.updates.agent_message_chunk': 2,
          'acp.turn.updates.plan': 1,
        },
      );
    }),
  );

  it.effect('does not count time waiting on the user as a gap', () =>
    Effect.gen(function* () {
      const { turn } = yield* turnAt(0);
      recordAwaitingUser(turn, 1, 100);
      recordAwaitingUser(turn, -1, 50_000);
      recordSessionUpdate(turn, chunk, 50_200);
      assert.strictEqual(promptTurnSummary(turn, 50_200)['acp.turn.maxGapMs'], 200);
    }),
  );
});

describe('takeDueTurnAlarms', () => {
  it.effect('warns once per silence and re-arms on activity', () =>
    Effect.gen(function* () {
      const { turn } = yield* turnAt(0);
      assert.deepStrictEqual(takeDueTurnAlarms(turn, SILENT_TURN_MS - 1), []);
      assert.deepStrictEqual(takeDueTurnAlarms(turn, SILENT_TURN_MS), [
        { _tag: 'Silent', openToolCalls: 0, silentMs: SILENT_TURN_MS },
      ]);
      assert.deepStrictEqual(takeDueTurnAlarms(turn, SILENT_TURN_MS * 2), []);
      recordSessionUpdate(turn, chunk, SILENT_TURN_MS * 2);
      assert.strictEqual(takeDueTurnAlarms(turn, SILENT_TURN_MS * 3).length, 1);
    }),
  );

  it.effect('stays quiet while waiting on the user', () =>
    Effect.gen(function* () {
      const { turn } = yield* turnAt(0);
      recordAwaitingUser(turn, 1, 0);
      assert.deepStrictEqual(takeDueTurnAlarms(turn, SILENT_TURN_MS * 5), []);
    }),
  );

  it.effect('warns when a cancel goes unanswered', () =>
    Effect.gen(function* () {
      const { turn } = yield* turnAt(0);
      recordCancelRequested(turn, 1000);
      recordSessionUpdate(turn, chunk, 1000 + CANCEL_UNANSWERED_MS);
      assert.deepStrictEqual(takeDueTurnAlarms(turn, 1000 + CANCEL_UNANSWERED_MS), [
        { _tag: 'CancelUnanswered', sinceCancelMs: CANCEL_UNANSWERED_MS },
      ]);
      assert.deepStrictEqual(takeDueTurnAlarms(turn, 1000 + CANCEL_UNANSWERED_MS * 2), []);
    }),
  );
});

describe('tool call spans', () => {
  it.effect('opens a child span on tool_call and ends it on completed', () =>
    Effect.gen(function* () {
      const { span: turnSpan, turn } = yield* turnAt(0);
      yield* recordToolCall(turn, 's1', {
        kind: 'tool_call',
        toolCallId: 't1',
        toolKind: 'read',
        toolStatus: 'pending',
      });
      const [open] = [...turn.toolCalls.values()];
      assert.isDefined(open);
      assert.strictEqual(open?.span.name, 'acp.toolCall');
      assert.strictEqual(open?.span.parent._tag === 'Some' ? open.span.parent.value : undefined, turnSpan);
      assert.strictEqual(open?.span.attributes.get('acp.tool.kind'), 'read');

      yield* recordToolCall(turn, 's1', { kind: 'tool_call_update', toolCallId: 't1', toolStatus: 'completed' });
      assert.strictEqual(turn.toolCalls.size, 0);
      assert.isTrue(open !== undefined && Exit.isSuccess(endExit(open.span) ?? Exit.fail('open')));
      assert.strictEqual(turn.toolCallsStarted, 1);
    }),
  );

  it.effect('ends a failed tool call span in error and counts it', () =>
    Effect.gen(function* () {
      const { turn } = yield* turnAt(0);
      yield* recordToolCall(turn, 's1', { kind: 'tool_call', toolCallId: 't1', toolStatus: 'in_progress' });
      const [open] = [...turn.toolCalls.values()];
      yield* recordToolCall(turn, 's1', { kind: 'tool_call_update', toolCallId: 't1', toolStatus: 'failed' });
      assert.isTrue(open !== undefined && Exit.isFailure(endExit(open.span) ?? Exit.void));
      assert.strictEqual(turn.toolCallsFailed, 1);
    }),
  );

  it.effect('ignores updates that are not tool calls', () =>
    Effect.gen(function* () {
      const { turn } = yield* turnAt(0);
      yield* recordToolCall(turn, 's1', chunk);
      assert.strictEqual(turn.toolCalls.size, 0);
    }),
  );

  it.effect('closes tool calls left open at turn end as orphaned', () =>
    Effect.gen(function* () {
      const { turn } = yield* turnAt(0);
      yield* recordToolCall(turn, 's1', { kind: 'tool_call', toolCallId: 't1', toolStatus: 'pending' });
      const [open] = [...turn.toolCalls.values()];
      assert.strictEqual(promptTurnSummary(turn, 0)['acp.turn.toolCalls.orphaned'], 1);
      yield* closeOrphanedToolCalls(turn, 'end_turn');
      assert.strictEqual(turn.toolCalls.size, 0);
      assert.strictEqual(open?.span.attributes.get('acp.tool.status'), 'orphaned');
      assert.strictEqual(open?.span.status._tag, 'Ended');
    }),
  );
});
