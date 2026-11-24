import { Analytics } from '@lib/context-services';
import type { AnalyticsEvent } from '@lib/context-services';
import { Effect } from 'effect';

import { appOpened } from './catalog.ts';

/** Capture `event`. Never fails or blocks (the Analytics Live is fire-and-forget). */
export const captureEvent = (event: AnalyticsEvent): Effect.Effect<void, never, Analytics> =>
  Effect.flatMap(Effect.service(Analytics), analytics => analytics.capture(event));

/**
 * One extra `pipe` stage at an action root: captures the event only once the action succeeded (failures stay in
 * logs and spans). A verb that can succeed without acting (skip paths) returns whether it did and passes
 * `didAct`, so a no-op captures nothing.
 */
export const trackEvent =
  <A = unknown>(event: AnalyticsEvent, didAct?: (result: A) => boolean) =>
  <E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Analytics> =>
    Effect.tap(self, result => (didAct === undefined || didAct(result) ? captureEvent(event) : Effect.void));

/** Fired once per Host bootstrap. */
export const captureAppOpened: Effect.Effect<void, never, Analytics> = captureEvent(appOpened());
