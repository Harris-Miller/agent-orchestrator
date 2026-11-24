/**
 * Observability for hub tool calls: one trace per call, an outcome on it, one log and two metrics. Everything recorded is
 * an id, a count, a duration or a closed discriminator (root ADR 0002): never args, results, error text or the token.
 */
import { Cause, Context, Data, Duration, Effect, Exit, Metric, Option, Predicate } from 'effect';
import type { Headers } from 'effect/http';
import { McpServer } from 'effect/ai';
import type { McpSchema } from 'effect/ai';

import { toolLabel } from './protocol.ts';
import { DURATION_MS, HUB_OUTCOME, HUB_TOOL } from './telemetryKeys.ts';

/**
 * How a hub tool call ended: `rejected` before it was routed (e.g. invalid arguments), `error` when it was routed and the
 * result is an error, `interrupted` when the agent abandoned it before it finished.
 */
export type HubOutcome = 'error' | 'interrupted' | 'ok' | 'rejected';

const toolCalls = Metric.counter('hub.tool_calls', { description: 'Hub tool calls, by tool and outcome.' });
const toolCallDuration = Metric.histogram('hub.tool_call.duration', {
  boundaries: Metric.exponentialBoundaries({ count: 14, factor: 2, start: 10 }),
  description: 'Hub tool call duration in milliseconds, by tool and outcome.',
});

/**
 * Provided to every tool call's handler: the handler calls `mark` when it starts routing the call, so a failure before
 * that (invalid arguments) is told apart from one after it.
 */
export class RoutingMark extends Context.Service<RoutingMark, { readonly mark: () => void }>()(
  '@lib/hub/RoutingMark',
) {}

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

export const outcomeOf = (exit: Exit.Exit<McpServer.MiddlewareSuccess, unknown>, routed: boolean): HubOutcome => {
  if (Exit.isSuccess(exit)) {
    return Predicate.hasProperty(exit.value, 'isError') && exit.value.isError === true ? 'error' : 'ok';
  }
  if (Cause.hasInterruptsOnly(exit.cause)) {
    return 'interrupted';
  }
  // A typed failure before the call was routed is a rejection (invalid arguments); anything after it is an error.
  return !routed && Option.isSome(Cause.findErrorOption(exit.cause)) ? 'rejected' : 'error';
};

/**
 * Wraps every `tools/call` (the argument decoding, which rejects invalid args before the handler, is inside it) in a
 * `hub.toolCall` root span, so each call is its own trace and rejected calls have one too.
 */
export const makeToolCallTelemetry = (telemetryAttributes: (token: string) => Record<string, string>) =>
  McpServer.middleware((effect, { headers, method, target }) => {
    if (method !== 'tools/call') {
      return effect;
    }
    const tool = toolLabel(target);
    const token = bearerToken(headers);
    const session = token === undefined ? {} : telemetryAttributes(token);
    // Kept out of the failure on purpose: a failure's value ends up on the span, and the result must not.
    let routed = false;
    let finished: Exit.Exit<McpServer.MiddlewareSuccess, McpSchema.McpErrorBase> | undefined;
    return Effect.gen(function* () {
      const start = yield* Effect.clockWith(clock => clock.currentTimeNanos);
      const record = (outcome: HubOutcome) =>
        Effect.gen(function* () {
          const end = yield* Effect.clockWith(clock => clock.currentTimeNanos);
          const durationMs = Duration.toMillis(Duration.nanos(end - start));
          const attributes = toolCallAttributes(session, tool, outcome);
          yield* Effect.annotateCurrentSpan(attributes);
          yield* Effect.logInfo('Hub tool call').pipe(
            Effect.annotateLogs({ ...attributes, [DURATION_MS]: durationMs }),
          );
          const tags = { [HUB_OUTCOME]: outcome, [HUB_TOOL]: tool };
          yield* Metric.update(Metric.withAttributes(toolCalls, tags), 1);
          yield* Metric.update(Metric.withAttributes(toolCallDuration, tags), durationMs);
          if (outcome === 'interrupted') {
            // Effect ends a span with error status on an interrupt exit, but a cancel is not a failure: end it first,
            // successfully (a span already ended is left alone when the fiber's real exit arrives).
            const span = yield* Effect.option(Effect.currentSpan);
            if (Option.isSome(span)) {
              span.value.end(end, Exit.void);
            }
          }
        });
      const routing = RoutingMark.of({
        mark: () => {
          routed = true;
        },
      });
      // An abandoned call (this fiber interrupted) never reaches the code after its exit, so it is recorded here instead;
      // an interrupt of only the inner effect is an exit, recorded below. Each call is recorded exactly once.
      const exit = yield* Effect.exit(effect.pipe(Effect.provideService(RoutingMark, routing))).pipe(
        Effect.onInterrupt(() => record('interrupted')),
      );
      const outcome = outcomeOf(exit, routed);
      yield* record(outcome);
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
