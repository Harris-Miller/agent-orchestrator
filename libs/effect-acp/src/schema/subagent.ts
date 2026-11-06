import { Schema } from 'effect';

import { optional } from './common.ts';

/** `"completed"` or `{state, stopReason?, error?}`; `state` stays an open string (agents add values). */
export const SubagentWorkState = Schema.Union([
  Schema.String,
  Schema.Struct({
    error: optional(Schema.NullOr(Schema.Unknown)),
    state: Schema.String,
    stopReason: optional(Schema.NullOr(Schema.String)),
  }),
]);

/**
 * Parent-addressed subagent announcement or patch: `subagent_spawned`, `subagent_state_update`, or the RFD's
 * `subagent_update`. Patch semantics per field: omitted = unchanged, `null` = clear, value = replace.
 */
export class SubagentUpdate extends Schema.Opaque<SubagentUpdate>()(
  Schema.Struct({
    capabilities: optional(Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown))),
    name: optional(Schema.NullOr(Schema.String)),
    sessionUpdate: Schema.Literals(['subagent_spawned', 'subagent_state_update', 'subagent_update']),
    state: optional(Schema.NullOr(SubagentWorkState)),
    subagentSessionId: Schema.String.check(Schema.isMinLength(1)),
    task: optional(Schema.NullOr(Schema.String)),
  }),
) {}
