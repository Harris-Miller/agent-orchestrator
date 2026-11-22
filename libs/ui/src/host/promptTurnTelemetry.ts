/**
 * Prompt turn telemetry: what happened during one `session/prompt`, when, and whether it finished, never what was
 * said. One record per in-flight turn, owned by the Backend connection. It parents Agent→Client spans, opens a child
 * span per tool call, tallies `session/update`s, and raises alarms for a turn that goes silent or ignores a cancel.
 */
import { Clock, Effect, Exit, Schema } from 'effect';
import type { Tracer } from 'effect';

import type { StopReason } from '@libs/effect-acp';

import type { AcpTelemetry, SessionUpdateSummary } from './acpTelemetry.ts';
import { promptTurnTelemetry, sessionUpdateTelemetry } from './acpTelemetry.ts';

/** No `session/update` for this long, while not waiting on the user, is worth a warning. */
export const SILENT_TURN_MS = 60_000;
/** A turn still unresolved this long after `session/cancel` is worth a warning. */
export const CANCEL_UNANSWERED_MS = 10_000;

type OpenToolCall = {
  readonly span: Tracer.Span;
  readonly startedAtMs: number;
  readonly toolCallId: string;
};

export type PromptTurn = {
  readonly span: Tracer.AnySpan;
  readonly startedAtMs: number;
  /** Permission or elicitation requests waiting on the user: the Agent is not expected to send anything meanwhile. */
  awaitingUser: number;
  cancelRequestedAtMs: number | undefined;
  cancelWarned: boolean;
  firstAgentChunkAtMs: number | undefined;
  firstUpdateAtMs: number | undefined;
  lastActivityAtMs: number;
  maxGapMs: number;
  silenceWarned: boolean;
  toolCallsFailed: number;
  toolCallsStarted: number;
  /** Open tool call spans by session id + tool call id (a subagent's tool calls count toward its root turn). */
  readonly toolCalls: Map<string, OpenToolCall>;
  readonly updates: Map<SessionUpdateSummary['kind'], number>;
};

export const makePromptTurn = (span: Tracer.AnySpan, nowMs: number): PromptTurn => ({
  awaitingUser: 0,
  cancelRequestedAtMs: undefined,
  cancelWarned: false,
  firstAgentChunkAtMs: undefined,
  firstUpdateAtMs: undefined,
  lastActivityAtMs: nowMs,
  maxGapMs: 0,
  silenceWarned: false,
  span,
  startedAtMs: nowMs,
  toolCalls: new Map(),
  toolCallsFailed: 0,
  toolCallsStarted: 0,
  updates: new Map(),
});

const markActivity = (turn: PromptTurn, nowMs: number): void => {
  if (turn.awaitingUser === 0) {
    turn.maxGapMs = Math.max(turn.maxGapMs, nowMs - turn.lastActivityAtMs);
  }
  turn.lastActivityAtMs = nowMs;
  turn.silenceWarned = false;
};

/** Tally one `session/update` into its turn. */
export const recordSessionUpdate = (turn: PromptTurn, summary: SessionUpdateSummary, nowMs: number): void => {
  markActivity(turn, nowMs);
  turn.firstUpdateAtMs ??= nowMs;
  if (summary.kind === 'agent_message_chunk') {
    turn.firstAgentChunkAtMs ??= nowMs;
  }
  turn.updates.set(summary.kind, (turn.updates.get(summary.kind) ?? 0) + 1);
};

/** A permission or elicitation request started (`+1`) or finished (`-1`) waiting on the user. */
export const recordAwaitingUser = (turn: PromptTurn, delta: 1 | -1, nowMs: number): void => {
  if (delta === -1) {
    turn.awaitingUser = Math.max(0, turn.awaitingUser - 1);
    turn.lastActivityAtMs = nowMs;
    turn.silenceWarned = false;
    return;
  }
  markActivity(turn, nowMs);
  turn.awaitingUser += 1;
};

export const recordCancelRequested = (turn: PromptTurn, nowMs: number): void => {
  turn.cancelRequestedAtMs ??= nowMs;
};

export type TurnAlarm =
  | { readonly _tag: 'CancelUnanswered'; readonly sinceCancelMs: number }
  | { readonly _tag: 'Silent'; readonly openToolCalls: number; readonly silentMs: number };

/** Take the alarms due at `nowMs`: each fires once (silence re-arms on the next activity). */
export const takeDueTurnAlarms = (turn: PromptTurn, nowMs: number): readonly TurnAlarm[] => {
  const alarms: TurnAlarm[] = [];
  const silentMs = nowMs - turn.lastActivityAtMs;
  if (turn.awaitingUser === 0 && !turn.silenceWarned && silentMs >= SILENT_TURN_MS) {
    turn.silenceWarned = true;
    alarms.push({ _tag: 'Silent', openToolCalls: turn.toolCalls.size, silentMs });
  }
  if (
    turn.cancelRequestedAtMs !== undefined &&
    !turn.cancelWarned &&
    nowMs - turn.cancelRequestedAtMs >= CANCEL_UNANSWERED_MS
  ) {
    turn.cancelWarned = true;
    alarms.push({ _tag: 'CancelUnanswered', sinceCancelMs: nowMs - turn.cancelRequestedAtMs });
  }
  return alarms;
};

/** The turn's tally for its span, at `nowMs`. */
export const promptTurnSummary = (turn: PromptTurn, nowMs: number): AcpTelemetry =>
  promptTurnTelemetry({
    firstAgentChunkMs: turn.firstAgentChunkAtMs === undefined ? undefined : turn.firstAgentChunkAtMs - turn.startedAtMs,
    firstUpdateMs: turn.firstUpdateAtMs === undefined ? undefined : turn.firstUpdateAtMs - turn.startedAtMs,
    maxGapMs: Math.max(turn.maxGapMs, turn.awaitingUser === 0 ? nowMs - turn.lastActivityAtMs : 0),
    toolCalls: turn.toolCallsStarted,
    toolCallsFailed: turn.toolCallsFailed,
    toolCallsOrphaned: turn.toolCalls.size,
    updates: turn.updates,
  });

/** A tool call the Agent reported `failed`: its span ends in error with no Agent text. */
export class ToolCallFailed extends Schema.TaggedError<ToolCallFailed>()('ToolCallFailed', {
  message: Schema.String,
}) {}

const toNanos = (ms: number): bigint => BigInt(ms) * 1_000_000n;

const endToolCall = (toolCall: OpenToolCall, status: 'completed' | 'failed' | 'orphaned', nowMs: number): void => {
  toolCall.span.attribute('acp.tool.status', status);
  toolCall.span.end(
    toNanos(nowMs),
    status === 'failed' ? Exit.fail(new ToolCallFailed({ message: 'Agent reported the tool call failed' })) : Exit.void,
  );
};

/**
 * Open, update, or close the tool call span a `tool_call` / `tool_call_update` belongs to. A tool call first seen
 * already finished gets a zero-length span; an update for a tool call never announced opens one at that point.
 */
export const recordToolCall = Effect.fnUntraced(function* (
  turn: PromptTurn,
  sessionId: string,
  summary: SessionUpdateSummary,
) {
  if ((summary.kind !== 'tool_call' && summary.kind !== 'tool_call_update') || summary.toolCallId === undefined) {
    return;
  }
  const nowMs = yield* Clock.currentTimeMillis;
  const key = `${sessionId}\u0000${summary.toolCallId}`;
  let toolCall = turn.toolCalls.get(key);
  if (toolCall === undefined) {
    const span = yield* Effect.makeSpan('acp.toolCall', {
      attributes: { 'acp.sessionId': sessionId, ...sessionUpdateTelemetry(summary) },
      parent: turn.span,
    });
    toolCall = { span, startedAtMs: nowMs, toolCallId: summary.toolCallId };
    turn.toolCalls.set(key, toolCall);
    turn.toolCallsStarted += 1;
  } else if (summary.toolKind !== undefined) {
    toolCall.span.attribute('acp.tool.kind', summary.toolKind);
  }
  if (summary.toolStatus === 'completed' || summary.toolStatus === 'failed') {
    turn.toolCalls.delete(key);
    if (summary.toolStatus === 'failed') {
      turn.toolCallsFailed += 1;
    }
    endToolCall(toolCall, summary.toolStatus, nowMs);
  } else if (summary.toolStatus !== undefined) {
    toolCall.span.event(`acp.tool.${summary.toolStatus}`, toNanos(nowMs));
  }
});

/** Close every tool call span still open when its turn ends, and report each as orphaned. */
export const closeOrphanedToolCalls = Effect.fnUntraced(function* (
  turn: PromptTurn,
  stopReason: StopReason | undefined,
) {
  if (turn.toolCalls.size === 0) {
    return;
  }
  const nowMs = yield* Clock.currentTimeMillis;
  const orphans = [...turn.toolCalls.values()].map(toolCall => ({
    ageMs: nowMs - toolCall.startedAtMs,
    toolCallId: toolCall.toolCallId,
  }));
  for (const toolCall of turn.toolCalls.values()) {
    endToolCall(toolCall, 'orphaned', nowMs);
  }
  turn.toolCalls.clear();
  // A cancelled turn routinely leaves tool calls unfinished.
  yield* stopReason === 'cancelled'
    ? Effect.logDebug('Tool calls unfinished at turn end', { orphans, stopReason })
    : Effect.logWarning('Tool calls unfinished at turn end', { orphans, stopReason: stopReason ?? 'none' });
});
