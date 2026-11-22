import { Schema } from 'effect';

export const TrackerProviderSchema = Schema.Literals(['github', 'gitlab', 'jira', 'linear']);
export type TrackerProvider = typeof TrackerProviderSchema.Type;

/** Reference to an external work item (issue, ticket) a Workstream follows. */
export const TrackerRefSchema = Schema.Struct({ provider: TrackerProviderSchema, key: Schema.String });
export type TrackerRef = typeof TrackerRefSchema.Type;

/** A session a Workstream owns; spans launch targets. */
export const WorkstreamSessionSchema = Schema.Struct({ launchTarget: Schema.String, sessionId: Schema.String });
export type WorkstreamSession = typeof WorkstreamSessionSchema.Type;

export const WorkstreamSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  trackers: Schema.Array(TrackerRefSchema),
  archived: Schema.Boolean,
  sessions: Schema.Array(WorkstreamSessionSchema),
});
export type Workstream = typeof WorkstreamSchema.Type;

/** Provisional shape of `workstreams.json`. */
export const WorkstreamsDocumentSchema = Schema.Struct({ workstreams: Schema.Array(WorkstreamSchema) });
export type WorkstreamsDocument = typeof WorkstreamsDocumentSchema.Type;
export const emptyWorkstreams: WorkstreamsDocument = { workstreams: [] };
export const WorkstreamsDocumentJsonString = Schema.fromJsonString(WorkstreamsDocumentSchema, { space: 2 });
