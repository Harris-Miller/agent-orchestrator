import { Schema } from 'effect';

export const SessionIndexEntrySchema = Schema.StructWithRest(
  Schema.Struct({
    cwd: Schema.String,
    sessionId: Schema.String,
    title: Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
    updatedAt: Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

export type SessionIndexEntry = typeof SessionIndexEntrySchema.Type;

/** Rows grouped by session cwd, so a host rewrites only the cwds it lists (merge-on-write). */
export const SessionIndexDocumentSchema = Schema.Struct({
  cwds: Schema.Record(Schema.String, Schema.Array(SessionIndexEntrySchema)),
});
export type SessionIndexDocument = typeof SessionIndexDocumentSchema.Type;
export const emptySessionIndex: SessionIndexDocument = { cwds: {} };
export const SessionIndexDocumentJsonString = Schema.fromJsonString(SessionIndexDocumentSchema, { space: 2 });
