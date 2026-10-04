import { Schema } from 'effect';

/** On-disk shape for one row in `adapters/<launchTarget>/roster.json`. */
export const AdapterRosterEntrySchema = Schema.Struct({
  cwd: Schema.String,
  sessionId: Schema.String,
  title: Schema.optionalKey(Schema.String),
  updatedAt: Schema.optionalKey(Schema.String),
});

export type AdapterRosterEntry = typeof AdapterRosterEntrySchema.Type;

/** On-disk shape for `adapters/<launchTarget>/roster.json`. */
export const AdapterRosterDocumentSchema = Schema.Struct({
  sessions: Schema.Array(AdapterRosterEntrySchema),
});

export type AdapterRosterDocument = typeof AdapterRosterDocumentSchema.Type;

export const emptyAdapterRoster: AdapterRosterDocument = { sessions: [] };

export const AdapterRosterDocumentJsonString = Schema.fromJsonString(AdapterRosterDocumentSchema, {
  space: 2,
});
