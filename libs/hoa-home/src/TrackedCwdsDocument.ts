import { Schema } from 'effect';

export const TrackedCwdsDocumentSchema = Schema.Struct({ cwds: Schema.Array(Schema.String) });
export type TrackedCwdsDocument = typeof TrackedCwdsDocumentSchema.Type;
export const emptyTrackedCwds: TrackedCwdsDocument = { cwds: [] };
export const TrackedCwdsDocumentJsonString = Schema.fromJsonString(TrackedCwdsDocumentSchema, { space: 2 });
