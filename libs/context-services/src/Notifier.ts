import type { Effect } from 'effect';
import { Context, Schema } from 'effect';

/** Host could not raise a Notification. */
export class NotifyFailed extends Schema.TaggedError<NotifyFailed>()('NotifyFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/**
 * Portable OS notification. The system Notification sound rides on the Notification
 * (`sound: true`); it is never played alone. React never imports host notification SDKs.
 */
export interface Notifier {
  /** Whether the Host window currently has focus. */
  readonly isWindowFocused: Effect.Effect<boolean>;
  readonly notify: (input: {
    readonly body: string;
    readonly sound: boolean;
    readonly title: string;
  }) => Effect.Effect<void, NotifyFailed>;
  /** `'os'`: native toast. `'in-app'`: Host-level message only (no OS toast / sound). */
  readonly supported: 'in-app' | 'os';
}

export const Notifier = Context.Service<Notifier>('Notifier');
