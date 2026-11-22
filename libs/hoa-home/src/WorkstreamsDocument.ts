import { Schema } from 'effect';

/** A session a Workstream owns; spans launch targets. */
export const WorkstreamSessionSchema = Schema.Struct({ launchTarget: Schema.String, sessionId: Schema.String });
export type WorkstreamSession = typeof WorkstreamSessionSchema.Type;

export const WorkstreamSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  archived: Schema.Boolean,
  sessions: Schema.Array(WorkstreamSessionSchema),
});
export type Workstream = typeof WorkstreamSchema.Type;

/** Provisional shape of `workstreams.json`. */
export const WorkstreamsDocumentSchema = Schema.Struct({ workstreams: Schema.Array(WorkstreamSchema) });
export type WorkstreamsDocument = typeof WorkstreamsDocumentSchema.Type;
export const emptyWorkstreams: WorkstreamsDocument = { workstreams: [] };
export const WorkstreamsDocumentJsonString = Schema.fromJsonString(WorkstreamsDocumentSchema, { space: 2 });
