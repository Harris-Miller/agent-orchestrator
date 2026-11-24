import { Analytics } from '@lib/context-services';
import type { AnalyticsEvent } from '@lib/context-services';
import { Effect, Layer } from 'effect';

/** An in-memory Analytics Live for tests: merge `layer` after `mockHostLayer` (the later layer wins). */
export const makeRecordingAnalytics = () => {
  const events: AnalyticsEvent[] = [];
  const layer = Layer.succeed(Analytics, {
    capture: event =>
      Effect.sync(() => {
        events.push(event);
      }),
  });
  return { events, layer };
};

/** Name and properties of every recorded event, for assertions. */
export const summarize = (events: readonly AnalyticsEvent[]) =>
  events.map(({ name, properties }) => ({ name, properties }));
