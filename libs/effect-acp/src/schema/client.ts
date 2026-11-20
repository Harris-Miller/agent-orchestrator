import { Schema } from 'effect';
import { Rpc } from 'effect/rpc';

import {
  AcpError,
  ElicitationId,
  EmptyResult,
  EnvVariable,
  MetaField,
  optional,
  PermissionOption,
  PermissionOptionId,
  SessionId,
  SessionUpdate,
  TerminalExitStatus,
  TerminalId,
  ToolCallUpdate,
} from './common.ts';
import { CreateElicitationRequestBody, CreateElicitationResponseBody } from './elicitation.ts';

/** AIR `_session/list/changes` (Agent→Client notification). Not in stable ClientRpcs. */
export const SESSION_LIST_CHANGES_METHOD = '_session/list/changes' as const;

const CLIENT_METHODS = {
  elicitation_complete: 'elicitation/complete',
  elicitation_create: 'elicitation/create',
  fs_read_text_file: 'fs/read_text_file',
  fs_write_text_file: 'fs/write_text_file',
  session_request_permission: 'session/request_permission',
  session_update: 'session/update',
  terminal_create: 'terminal/create',
  terminal_kill: 'terminal/kill',
  terminal_output: 'terminal/output',
  terminal_release: 'terminal/release',
  terminal_wait_for_exit: 'terminal/wait_for_exit',
} as const;

// =============================================================================
// Payload schemas
// =============================================================================

export class RequestPermissionRequest extends Schema.Opaque<RequestPermissionRequest>()(
  Schema.Struct({
    _meta: MetaField,
    options: Schema.Array(PermissionOption),
    sessionId: SessionId,
    toolCall: ToolCallUpdate,
  }),
) {}

export const RequestPermissionOutcome = Schema.Union([
  Schema.Struct({
    outcome: Schema.Literals(['cancelled']),
  }),
  Schema.Struct({
    _meta: MetaField,
    optionId: PermissionOptionId,
    outcome: Schema.Literals(['selected']),
  }),
]);
export type RequestPermissionOutcome = typeof RequestPermissionOutcome.Type;

export class RequestPermissionResponse extends Schema.Opaque<RequestPermissionResponse>()(
  Schema.Struct({
    _meta: MetaField,
    outcome: RequestPermissionOutcome,
  }),
) {}

export class ReadTextFileRequest extends Schema.Opaque<ReadTextFileRequest>()(
  Schema.Struct({
    _meta: MetaField,
    limit: optional(Schema.NullOr(Schema.Number)),
    line: optional(Schema.NullOr(Schema.Number)),
    path: Schema.String,
    sessionId: SessionId,
  }),
) {}

export class ReadTextFileResponse extends Schema.Opaque<ReadTextFileResponse>()(
  Schema.Struct({
    _meta: MetaField,
    content: Schema.String,
  }),
) {}

export class WriteTextFileRequest extends Schema.Opaque<WriteTextFileRequest>()(
  Schema.Struct({
    _meta: MetaField,
    content: Schema.String,
    path: Schema.String,
    sessionId: SessionId,
  }),
) {}

export const WriteTextFileResponse = EmptyResult;
export type WriteTextFileResponse = EmptyResult;

export class CreateTerminalRequest extends Schema.Opaque<CreateTerminalRequest>()(
  Schema.Struct({
    _meta: MetaField,
    args: optional(Schema.Array(Schema.String)),
    command: Schema.String,
    cwd: optional(Schema.NullOr(Schema.String)),
    env: optional(Schema.Array(EnvVariable)),
    outputByteLimit: optional(Schema.NullOr(Schema.Number)),
    sessionId: SessionId,
  }),
) {}

export class CreateTerminalResponse extends Schema.Opaque<CreateTerminalResponse>()(
  Schema.Struct({
    _meta: MetaField,
    terminalId: TerminalId,
  }),
) {}

export class TerminalOutputRequest extends Schema.Opaque<TerminalOutputRequest>()(
  Schema.Struct({
    _meta: MetaField,
    sessionId: SessionId,
    terminalId: TerminalId,
  }),
) {}

export class TerminalOutputResponse extends Schema.Opaque<TerminalOutputResponse>()(
  Schema.Struct({
    _meta: MetaField,
    exitStatus: optional(Schema.NullOr(TerminalExitStatus)),
    output: Schema.String,
    truncated: Schema.Boolean,
  }),
) {}

export class ReleaseTerminalRequest extends Schema.Opaque<ReleaseTerminalRequest>()(
  Schema.Struct({
    _meta: MetaField,
    sessionId: SessionId,
    terminalId: TerminalId,
  }),
) {}

export const ReleaseTerminalResponse = EmptyResult;
export type ReleaseTerminalResponse = EmptyResult;

export class WaitForTerminalExitRequest extends Schema.Opaque<WaitForTerminalExitRequest>()(
  Schema.Struct({
    _meta: MetaField,
    sessionId: SessionId,
    terminalId: TerminalId,
  }),
) {}

export class WaitForTerminalExitResponse extends Schema.Opaque<WaitForTerminalExitResponse>()(
  Schema.Struct({
    _meta: MetaField,
    exitCode: optional(Schema.NullOr(Schema.Number)),
    signal: optional(Schema.NullOr(Schema.String)),
  }),
) {}

export class KillTerminalRequest extends Schema.Opaque<KillTerminalRequest>()(
  Schema.Struct({
    _meta: MetaField,
    sessionId: SessionId,
    terminalId: TerminalId,
  }),
) {}

export const KillTerminalResponse = EmptyResult;
export type KillTerminalResponse = EmptyResult;

/** Large tagged union — opaque until structurally expanded. */
export const CreateElicitationRequest = CreateElicitationRequestBody;
export type CreateElicitationRequest = CreateElicitationRequestBody;

export const CreateElicitationResponse = CreateElicitationResponseBody;
export type CreateElicitationResponse = CreateElicitationResponseBody;

export class SessionNotification extends Schema.Opaque<SessionNotification>()(
  Schema.Struct({
    _meta: MetaField,
    sessionId: SessionId,
    update: SessionUpdate,
  }),
) {}

/** Rows share `session/list`'s flat shape; kept opaque here, normalized by the Harness. */
export class SessionListChangesNotificationPayload extends Schema.Opaque<SessionListChangesNotificationPayload>()(
  Schema.Struct({
    _meta: MetaField,
    removed: Schema.Array(Schema.String),
    sessions: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
    subscriptionId: Schema.String,
  }),
) {}

export class CompleteElicitationNotification extends Schema.Opaque<CompleteElicitationNotification>()(
  Schema.Struct({
    _meta: MetaField,
    elicitationId: ElicitationId,
  }),
) {}

// =============================================================================
// Rpc classes
// =============================================================================

export class SessionRequestPermission extends Rpc.make(CLIENT_METHODS.session_request_permission, {
  error: AcpError,
  payload: RequestPermissionRequest,
  success: RequestPermissionResponse,
}) {}

export class FsReadTextFile extends Rpc.make(CLIENT_METHODS.fs_read_text_file, {
  error: AcpError,
  payload: ReadTextFileRequest,
  success: ReadTextFileResponse,
}) {}

export class FsWriteTextFile extends Rpc.make(CLIENT_METHODS.fs_write_text_file, {
  error: AcpError,
  payload: WriteTextFileRequest,
  success: WriteTextFileResponse,
}) {}

export class TerminalCreate extends Rpc.make(CLIENT_METHODS.terminal_create, {
  error: AcpError,
  payload: CreateTerminalRequest,
  success: CreateTerminalResponse,
}) {}

export class TerminalOutput extends Rpc.make(CLIENT_METHODS.terminal_output, {
  error: AcpError,
  payload: TerminalOutputRequest,
  success: TerminalOutputResponse,
}) {}

export class TerminalRelease extends Rpc.make(CLIENT_METHODS.terminal_release, {
  error: AcpError,
  payload: ReleaseTerminalRequest,
  success: ReleaseTerminalResponse,
}) {}

export class TerminalWaitForExit extends Rpc.make(CLIENT_METHODS.terminal_wait_for_exit, {
  error: AcpError,
  payload: WaitForTerminalExitRequest,
  success: WaitForTerminalExitResponse,
}) {}

export class TerminalKill extends Rpc.make(CLIENT_METHODS.terminal_kill, {
  error: AcpError,
  payload: KillTerminalRequest,
  success: KillTerminalResponse,
}) {}

export class ElicitationCreate extends Rpc.make(CLIENT_METHODS.elicitation_create, {
  error: AcpError,
  payload: CreateElicitationRequest,
  success: CreateElicitationResponse,
}) {}

export class SessionUpdateNotification extends Rpc.make(CLIENT_METHODS.session_update, {
  payload: SessionNotification,
}) {}

export class ElicitationComplete extends Rpc.make(CLIENT_METHODS.elicitation_complete, {
  payload: CompleteElicitationNotification,
}) {}

/** AIR `_session/list/changes`. Keep out of ClientNotificationRpcs; served via UnstableClientNotificationRpcs. */
export class SessionListChangesNotification extends Rpc.make(SESSION_LIST_CHANGES_METHOD, {
  payload: SessionListChangesNotificationPayload,
}) {}
