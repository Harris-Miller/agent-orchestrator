import { Schema } from 'effect';

export const PinnedSessionSchema = Schema.Struct({ cwd: Schema.String, sessionId: Schema.String });
export type PinnedSession = typeof PinnedSessionSchema.Type;

export const PinnedSessionsDocumentSchema = Schema.Struct({ pinned: Schema.Array(PinnedSessionSchema) });
export type PinnedSessionsDocument = typeof PinnedSessionsDocumentSchema.Type;
export const emptyPinnedSessions: PinnedSessionsDocument = { pinned: [] };
export const PinnedSessionsDocumentJsonString = Schema.fromJsonString(PinnedSessionsDocumentSchema, { space: 2 });
