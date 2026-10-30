import { Schema } from 'effect';

/** On-disk shape for one row in `adapters/<launchTarget>/history.json`. */
export const AdapterHistoryEntrySchema = Schema.Struct({
  cwd: Schema.String,
  sessionId: Schema.String,
  title: Schema.optionalKey(Schema.String),
  updatedAt: Schema.optionalKey(Schema.String),
});

export type AdapterHistoryEntry = typeof AdapterHistoryEntrySchema.Type;

/** On-disk shape for `adapters/<launchTarget>/history.json`. */
export const AdapterHistoryDocumentSchema = Schema.Struct({
  sessions: Schema.Array(AdapterHistoryEntrySchema),
});

export type AdapterHistoryDocument = typeof AdapterHistoryDocumentSchema.Type;

export const emptyAdapterHistory: AdapterHistoryDocument = { sessions: [] };

export const AdapterHistoryDocumentJsonString = Schema.fromJsonString(AdapterHistoryDocumentSchema, {
  space: 2,
});
