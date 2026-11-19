import { Schema } from 'effect';

import { optional } from './common.ts';

/** Values the client knows for each open-string field of {@link SessionFailure}; anything else is tolerated on the wire. */
export const SESSION_FAILURE_CATEGORIES = ['connection', 'access', 'limit', 'request', 'service', 'unknown'] as const;
export const SESSION_FAILURE_SEVERITIES = ['warning', 'error'] as const;
export const SESSION_FAILURE_ACTIONS = ['retry', 'login', 'new_session'] as const;

export type SessionFailureCategory = (typeof SESSION_FAILURE_CATEGORIES)[number];
export type SessionFailureSeverity = (typeof SESSION_FAILURE_SEVERITIES)[number];
export type SessionFailureAction = (typeof SESSION_FAILURE_ACTIONS)[number];

export const isSessionFailureAction = (value: string): value is SessionFailureAction =>
  (SESSION_FAILURE_ACTIONS as readonly string[]).includes(value);
export const isSessionFailureSeverity = (value: string): value is SessionFailureSeverity =>
  (SESSION_FAILURE_SEVERITIES as readonly string[]).includes(value);

/**
 * AIR `_meta.jetbrains.air.sessionFailure`: one typed, revisable error or warning row. Same `id` with a higher
 * `revision` replaces the row. `category`, `severity` and `actions` stay open strings (agents add values); the known
 * ones are the `SESSION_FAILURE_*` constants above.
 */
export class SessionFailure extends Schema.Opaque<SessionFailure>()(
  Schema.Struct({
    actions: Schema.Array(Schema.String),
    category: Schema.String,
    details: optional(Schema.NullOr(Schema.String)),
    id: Schema.String.check(Schema.isMinLength(1)),
    reason: optional(Schema.NullOr(Schema.String)),
    revision: Schema.Int,
    severity: Schema.String,
    title: Schema.String,
  }),
) {}
