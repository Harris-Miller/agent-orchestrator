import { Schema } from 'effect';

/** On-disk shape for `sessions/<id>/usage.json`. */
export const SessionUsageDocumentSchema = Schema.Struct({
  // some providers omit the `cost` key, other include it set to `undefined`, so Schema needs to be told to handle both cases
  cost: Schema.optionalKey(
    Schema.UndefinedOr(
      Schema.Struct({
        amount: Schema.Number,
        currency: Schema.String,
      }),
    ),
  ),
  size: Schema.Number,
  used: Schema.Number,
});

export type SessionUsageDocument = typeof SessionUsageDocumentSchema.Type;

export const SessionUsageDocumentJsonString = Schema.fromJsonString(SessionUsageDocumentSchema, {
  space: 2,
});
