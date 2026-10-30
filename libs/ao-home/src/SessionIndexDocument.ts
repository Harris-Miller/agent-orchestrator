import { Schema } from 'effect';

export const SessionIndexEntrySchema = Schema.Struct({
  cwd: Schema.String,
  sessionId: Schema.String,
  title: Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
});

export type SessionIndexEntry = typeof SessionIndexEntrySchema.Type;

export const SessionIndexDocumentSchema = Schema.Struct({ sessions: Schema.Array(SessionIndexEntrySchema) });
export type SessionIndexDocument = typeof SessionIndexDocumentSchema.Type;
export const emptySessionIndex: SessionIndexDocument = { sessions: [] };
export const SessionIndexDocumentJsonString = Schema.fromJsonString(SessionIndexDocumentSchema, { space: 2 });
