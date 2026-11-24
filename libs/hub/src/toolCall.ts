/**
 * Observability for hub tool calls: one trace per call, an outcome on it, one log and two metrics. Everything recorded is
 * an id, a count, a duration or a closed discriminator (root ADR 0002): never args, results, error text or the token.
 */
import { Cause, Data, Duration, Effect, Exit, Metric, Option, Predicate } from 'effect';
import type { Headers } from 'effect/http';
import { McpServer } from 'effect/ai';
import type { McpSchema } from 'effect/ai';

import { toolLabel } from './protocol.ts';
import type { HubState } from './state.ts';
import { HUB_OUTCOME, HUB_TOOL } from './telemetryKeys.ts';

/** How a hub tool call ended: `rejected` before it was routed (e.g. invalid arguments), `error` when it was routed and the result is an error. */
export type HubOutcome = 'error' | 'ok' | 'rejected';

const toolCalls = Metric.counter('hub.tool_calls', { description: 'Hub tool calls, by tool and outcome.' });
const toolCallDuration = Metric.histogram('hub.tool_call.duration', {
  boundaries: Metric.exponentialBoundaries({ count: 14, factor: 2, start: 10 }),
  description: 'Hub tool call duration in milliseconds, by tool and outcome.',
});

/** Marks the span failed without carrying any text (a plain error would put its message on the span). */
class ToolCallFailed extends Data.TaggedError('ToolCallFailed') {}

const bearerToken = (headers: Headers.Headers): string | undefined => {
  const header = headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
};

/** What a finished call records on its span and in its one log: the owner's session ids, the tool and the outcome. */
export const toolCallAttributes = (
  session: Readonly<Record<string, string>>,
  tool: string,
  outcome: HubOutcome,
): Record<string, string> => ({ ...session, [HUB_OUTCOME]: outcome, [HUB_TOOL]: tool });

const outcomeOf = (exit: Exit.Exit<McpServer.MiddlewareSuccess, unknown>): HubOutcome => {
  if (Exit.isSuccess(exit)) {
    return Predicate.hasProperty(exit.value, 'isError') && exit.value.isError === true ? 'error' : 'ok';
  }
  // The only failure the tool call can end in before the handler ran is a rejection (invalid arguments); a defect is an error.
  return Option.isSome(Cause.findErrorOption(exit.cause)) ? 'rejected' : 'error';
};

/**
 * Wraps every `tools/call` (the argument decoding, which rejects invalid args before the handler, is inside it) in a
 * `hub.toolCall` root span, so each call is its own trace and rejected calls have one too.
 */
export const makeToolCallTelemetry = (state: HubState) =>
  McpServer.middleware((effect, { headers, method, target }) => {
    if (method !== 'tools/call') {
      return effect;
    }
    const tool = toolLabel(target);
    const token = bearerToken(headers);
    const session = token === undefined ? {} : state.describe(token);
    // Kept out of the failure on purpose: a failure's value ends up on the span, and the result must not.
    let finished: Exit.Exit<McpServer.MiddlewareSuccess, McpSchema.McpErrorBase> | undefined;
    return Effect.gen(function* () {
      const start = yield* Effect.clockWith(clock => clock.currentTimeNanos);
      const exit = yield* Effect.exit(effect);
      const end = yield* Effect.clockWith(clock => clock.currentTimeNanos);
      const durationMs = Duration.toMillis(Duration.nanos(end - start));
      const outcome = outcomeOf(exit);
      const attributes = toolCallAttributes(session, tool, outcome);
      yield* Effect.annotateCurrentSpan(attributes);
      yield* Effect.logInfo('Hub tool call').pipe(Effect.annotateLogs({ ...attributes, duration_ms: durationMs }));
      const tags = { [HUB_OUTCOME]: outcome, [HUB_TOOL]: tool };
      yield* Metric.update(Metric.withAttributes(toolCalls, tags), 1);
      yield* Metric.update(Metric.withAttributes(toolCallDuration, tags), durationMs);
      finished = exit;
      if (outcome !== 'ok') {
        // Failing inside the span gives it an error status; the real exit is restored once the span has ended.
        return yield* new ToolCallFailed();
      }
      return yield* exit;
    }).pipe(
      Effect.withSpan('hub.toolCall', { root: true }),
      Effect.catchTag('ToolCallFailed', () => finished ?? Effect.die('unreachable')),
    );
  });
