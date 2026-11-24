/**
 * ACP telemetry projections (ADR 0002): the only way an ACP object reaches a span attribute or log. Each projection
 * copies an allowlist of protocol discriminators, ids, counts and durations and never reads free text, so Private data
 * (prompt and Agent text, tool titles, raw tool input and output, paths) cannot leak through it. Agent-supplied
 * discriminators are free strings on the wire: anything outside the ACP literal set becomes `unrecognized` (distinct from
 * ACP's own `other` tool kind).
 */
import { PermissionOptionKind } from '@lib/effect-acp';
import type { StopReason } from '@lib/effect-acp';
import { Predicate, Schema } from 'effect';

declare const acpTelemetryBrand: unique symbol;

/** Span attributes / log fields built only by a projection in this module. */
export type AcpTelemetry = Readonly<Record<string, boolean | number | string>> & {
  readonly [acpTelemetryBrand]: never;
};

const telemetry = (fields: Readonly<Record<string, boolean | number | string | undefined>>): AcpTelemetry =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as AcpTelemetry;

export const SessionUpdateKind = Schema.Literals([
  'agent_message_chunk',
  'agent_thought_chunk',
  'available_commands_update',
  'config_option_update',
  'current_mode_update',
  'plan',
  'session_info_update',
  'session_message',
  'session_message_chunk',
  'tool_call',
  'tool_call_update',
  'usage_update',
  'user_message_chunk',
]);
export type SessionUpdateKind = typeof SessionUpdateKind.Type;

export const ToolKind = Schema.Literals([
  'delete',
  'edit',
  'execute',
  'fetch',
  'move',
  'other',
  'read',
  'search',
  'switch_mode',
  'think',
]);
export type ToolKind = typeof ToolKind.Type;

export const ToolCallStatus = Schema.Literals(['completed', 'failed', 'in_progress', 'pending']);
export type ToolCallStatus = typeof ToolCallStatus.Type;

const ContentType = Schema.Literals(['audio', 'image', 'resource', 'resource_link', 'text']);
type ContentType = typeof ContentType.Type;

const PermissionOutcome = Schema.Literals(['cancelled', 'selected']);
const ElicitationMode = Schema.Literals(['form', 'url']);
const ElicitationAction = Schema.Literals(['accept', 'cancel', 'decline']);

/** Longest id kept; an id is an identifier, not a place for an Agent to put text. */
const MAX_ID_LENGTH = 128;

/** A value outside the ACP literal set. */
type Unrecognized = 'unrecognized';

/** A literal from `schema`'s set, `unrecognized` for any other value, `undefined` when absent. */
const literalOrOther = <A extends string>(schema: Schema.Codec<A>, value: unknown): A | Unrecognized | undefined =>
  value === undefined || value === null ? undefined : Schema.is(schema)(value) ? value : 'unrecognized';

const idOf = (value: unknown): string | undefined =>
  Predicate.isString(value) && value.length > 0 && value.length <= MAX_ID_LENGTH ? value : undefined;

const countOf = (value: unknown): number | undefined => (Array.isArray(value) ? value.length : undefined);

/** What a `session/update` was, never what it said. */
export type SessionUpdateSummary = {
  readonly contentType?: ContentType | Unrecognized;
  readonly kind: SessionUpdateKind | Unrecognized;
  readonly locations?: number;
  readonly planEntries?: number;
  readonly textChars?: number;
  readonly toolCallId?: string;
  readonly toolKind?: ToolKind | Unrecognized;
  readonly toolStatus?: ToolCallStatus | Unrecognized;
};

const isChunk = (kind: SessionUpdateSummary['kind']): boolean =>
  kind === 'agent_message_chunk' ||
  kind === 'agent_thought_chunk' ||
  kind === 'user_message_chunk' ||
  kind === 'session_message_chunk';

export const summarizeSessionUpdate = (update: unknown): SessionUpdateSummary => {
  if (!Predicate.isObject(update)) {
    return { kind: 'unrecognized' };
  }
  const kind = literalOrOther(SessionUpdateKind, update.sessionUpdate) ?? 'unrecognized';
  if (kind === 'tool_call' || kind === 'tool_call_update') {
    const toolCallId = idOf(update.toolCallId);
    const toolKind = literalOrOther(ToolKind, update.kind);
    const toolStatus = literalOrOther(ToolCallStatus, update.status);
    const locations = countOf(update.locations);
    return {
      kind,
      ...(toolCallId === undefined ? {} : { toolCallId }),
      ...(toolKind === undefined ? {} : { toolKind }),
      ...(toolStatus === undefined ? {} : { toolStatus }),
      ...(locations === undefined ? {} : { locations }),
    };
  }
  if (isChunk(kind) && Predicate.isObject(update.content)) {
    const contentType = literalOrOther(ContentType, update.content.type);
    const { text } = update.content;
    return {
      kind,
      ...(contentType === undefined ? {} : { contentType }),
      ...(contentType === 'text' && Predicate.isString(text) ? { textChars: text.length } : {}),
    };
  }
  if (kind === 'plan') {
    const planEntries = countOf(update.entries);
    return planEntries === undefined ? { kind } : { kind, planEntries };
  }
  return { kind };
};

export const sessionUpdateTelemetry = (summary: SessionUpdateSummary): AcpTelemetry =>
  telemetry({
    'acp.content.chars': summary.textChars,
    'acp.content.type': summary.contentType,
    'acp.plan.entries': summary.planEntries,
    'acp.tool.kind': summary.toolKind,
    'acp.tool.locations': summary.locations,
    'acp.tool.status': summary.toolStatus,
    'acp.toolCallId': summary.toolCallId,
    'acp.update': summary.kind,
  });

const optionKindsOf = (options: unknown): readonly (PermissionOptionKind | Unrecognized)[] =>
  Array.isArray(options)
    ? options.map((option: unknown) =>
        Predicate.isObject(option)
          ? (literalOrOther(PermissionOptionKind, option.kind) ?? 'unrecognized')
          : 'unrecognized',
      )
    : [];

/** Which option kind the user picked, looked up by `optionId` among the offered options (the id itself is not kept). */
const selectedOptionKind = (options: unknown, optionId: unknown): PermissionOptionKind | Unrecognized => {
  const option: unknown = Array.isArray(options)
    ? (options as readonly unknown[]).find(
        candidate => Predicate.isObject(candidate) && candidate.optionId === optionId,
      )
    : undefined;
  return Predicate.isObject(option)
    ? (literalOrOther(PermissionOptionKind, option.kind) ?? 'unrecognized')
    : 'unrecognized';
};

/** A `session/request_permission` and, once answered, its outcome: tool call id and kind, offered and chosen option kinds. */
export const permissionTelemetry = (request: unknown, response?: unknown): AcpTelemetry => {
  const toolCall = Predicate.isObject(request) && Predicate.isObject(request.toolCall) ? request.toolCall : {};
  const options = Predicate.isObject(request) ? request.options : undefined;
  const outcome = Predicate.isObject(response) && Predicate.isObject(response.outcome) ? response.outcome : undefined;
  const outcomeKind = outcome === undefined ? undefined : literalOrOther(PermissionOutcome, outcome.outcome);
  return telemetry({
    'acp.permission.options': optionKindsOf(options).join(','),
    'acp.permission.outcome': outcomeKind,
    'acp.permission.selected':
      outcomeKind === 'selected' && outcome !== undefined ? selectedOptionKind(options, outcome.optionId) : undefined,
    'acp.tool.kind': literalOrOther(ToolKind, toolCall.kind),
    'acp.toolCallId': idOf(toolCall.toolCallId),
  });
};

/** An `elicitation/create` and, once answered, the user's action. Never the message, schema or answers. */
export const elicitationTelemetry = (request: unknown, response?: unknown): AcpTelemetry =>
  telemetry({
    'acp.elicitation.action': Predicate.isObject(response)
      ? literalOrOther(ElicitationAction, response.action)
      : undefined,
    'acp.elicitation.mode': Predicate.isObject(request) ? literalOrOther(ElicitationMode, request.mode) : undefined,
  });

const USAGE_FIELDS = [
  'cachedReadTokens',
  'cachedWriteTokens',
  'inputTokens',
  'outputTokens',
  'thoughtTokens',
  'totalTokens',
] as const;

/** A `session/prompt` response: stop reason and token counts. */
export const promptResponseTelemetry = (response: { readonly stopReason: StopReason; readonly usage?: unknown }) =>
  telemetry({
    'acp.stopReason': response.stopReason,
    ...Object.fromEntries(
      USAGE_FIELDS.map(field => {
        const value = Predicate.isObject(response.usage) ? response.usage[field] : undefined;
        return [`acp.usage.${field}`, Predicate.isNumber(value) ? value : undefined];
      }),
    ),
  });

/** A Prompt turn's tally: timings in ms since the turn started, update counts by kind, tool call counts. */
export const promptTurnTelemetry = (tally: {
  readonly firstAgentChunkMs: number | undefined;
  readonly firstUpdateMs: number | undefined;
  readonly maxGapMs: number;
  readonly toolCalls: number;
  readonly toolCallsFailed: number;
  readonly toolCallsOrphaned: number;
  readonly updates: ReadonlyMap<SessionUpdateKind | Unrecognized, number>;
}): AcpTelemetry =>
  telemetry({
    'acp.turn.firstAgentChunkMs': tally.firstAgentChunkMs,
    'acp.turn.firstUpdateMs': tally.firstUpdateMs,
    'acp.turn.maxGapMs': tally.maxGapMs,
    'acp.turn.toolCalls': tally.toolCalls,
    'acp.turn.toolCalls.failed': tally.toolCallsFailed,
    'acp.turn.toolCalls.orphaned': tally.toolCallsOrphaned,
    ...Object.fromEntries([...tally.updates].map(([kind, count]) => [`acp.turn.updates.${kind}`, count])),
  });
