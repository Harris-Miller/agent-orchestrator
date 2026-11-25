import { Schema } from 'effect';

/** One Tracked session: the session/list row snapshot (open rest keeps `_meta`, incl. the app-owned `archived` flag). */
export const TrackedSessionRecordSchema = Schema.StructWithRest(
  Schema.Struct({
    /** Absolute directories handed to the Agent beyond `cwd` (Additional directories); absent when none. */
    additionalDirectories: Schema.optionalKey(Schema.Array(Schema.String)),
    cwd: Schema.String,
    /** The user edited the Additional directories: that list wins over a re-read of the Workspace file on activation. */
    directoriesEdited: Schema.optionalKey(Schema.Literal(true)),
    sessionId: Schema.String,
    title: Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
    updatedAt: Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
    /** The `.code-workspace` file the Additional directories came from; never sent to the Agent. */
    workspaceFile: Schema.optionalKey(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

export type TrackedSessionRecord = typeof TrackedSessionRecordSchema.Type;

/** Records grouped by session cwd; each change touches one record (merge-on-write). */
export const TrackedSessionsDocumentSchema = Schema.Struct({
  cwds: Schema.Record(Schema.String, Schema.Array(TrackedSessionRecordSchema)),
});
export type TrackedSessionsDocument = typeof TrackedSessionsDocumentSchema.Type;
export const emptyTrackedSessions: TrackedSessionsDocument = { cwds: {} };
export const TrackedSessionsDocumentJsonString = Schema.fromJsonString(TrackedSessionsDocumentSchema, { space: 2 });
