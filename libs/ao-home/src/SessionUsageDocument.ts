import { Schema } from 'effect';

/** On-disk shape for `sessions/<id>/usage.json`. */
export const SessionUsageDocumentSchema = Schema.Struct({
  cost: Schema.optionalKey(
    Schema.Struct({
      amount: Schema.Number,
      currency: Schema.String,
    }),
  ),
  size: Schema.Number,
  used: Schema.Number,
});

export type SessionUsageDocument = typeof SessionUsageDocumentSchema.Type;

export const SessionUsageDocumentJsonString = Schema.fromJsonString(SessionUsageDocumentSchema, {
  space: 2,
});
