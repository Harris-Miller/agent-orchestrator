import type { Effect } from 'effect';
import { Context, Schema } from 'effect';

/** Host could not raise a Notification. */
export class NotifyFailed extends Schema.TaggedError<NotifyFailed>()('NotifyFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/**
 * Portable OS notification plus a standalone chime. The system Notification sound rides on the Notification
 * (`sound: true`); `playSound` is the app-played chime used when Notifications are off. React never imports
 * host notification SDKs.
 */
export interface Notifier {
  /** Whether the Host window currently has focus. */
  readonly isWindowFocused: Effect.Effect<boolean>;
  readonly notify: (input: {
    readonly body: string;
    readonly sound: boolean;
    readonly title: string;
  }) => Effect.Effect<void, NotifyFailed>;
  /** Play the app's own chime, with no Notification. A no-op on an `'in-app'` Notifier. */
  readonly playSound: Effect.Effect<void, NotifyFailed>;
  /** `'os'`: native toast. `'in-app'`: Host-level message only (no OS toast / sound). */
  readonly supported: 'in-app' | 'os';
}

export const Notifier = Context.Service<Notifier>('Notifier');
