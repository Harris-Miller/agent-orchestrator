import { Context, Effect, Layer } from 'effect';

/** The only property value types an Analytics event may carry: no objects, arrays or `undefined`. */
export type AnalyticsProperties = Readonly<Record<string, boolean | number | string>>;

declare const analyticsEventBrand: unique symbol;

/**
 * A product Analytics event. Branded so {@link Analytics.capture} accepts only a value built by
 * {@link makeAnalyticsEvent}, which the `@lib/ui` event catalog alone calls: no free-form `capture('name', {...})`.
 */
export interface AnalyticsEvent {
  readonly [analyticsEventBrand]: true;
  readonly name: string;
  readonly properties: AnalyticsProperties;
}

/** Builds an {@link AnalyticsEvent}. Call it only from the event catalog (root ADR 0004). */
export const makeAnalyticsEvent = (name: string, properties: AnalyticsProperties = {}): AnalyticsEvent =>
  ({ name, properties }) as AnalyticsEvent;

/**
 * Portable product Analytics capture. Fire-and-forget: `capture` cannot fail and never blocks the caller; a Live that
 * cannot deliver drops the event. React never imports a vendor SDK.
 */
export interface Analytics {
  readonly capture: (event: AnalyticsEvent) => Effect.Effect<void>;
}

export const Analytics = Context.Service<Analytics>('Analytics');

/** Drops every event: the Live for prod builds and for a dev build with no project token. */
export const AnalyticsNoopLive: Layer.Layer<Analytics> = Layer.succeed(Analytics, { capture: () => Effect.void });
