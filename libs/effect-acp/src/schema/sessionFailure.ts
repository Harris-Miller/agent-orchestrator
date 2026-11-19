import { Schema } from 'effect';

import { optional } from './common.ts';

/**
 * AIR `_meta.jetbrains.air.sessionFailure`: one typed, revisable error or warning row. Same `id` with a higher
 * `revision` replaces the row. Open strings stay tolerant (agents add values); known values:
 * - `category`: `connection | access | limit | request | service | unknown`
 * - `severity`: `warning | error`
 * - `actions`: `retry | login | new_session`
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
