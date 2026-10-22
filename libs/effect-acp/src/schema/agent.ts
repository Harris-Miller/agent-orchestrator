import { Schema } from 'effect';
import { Rpc } from 'effect/rpc';

import {
  AcpError,
  AgentCapabilities,
  AuthMethod,
  AuthMethodId,
  EmptyResult,
  Implementation,
  McpServer,
  MetaField,
  optional,
  ProtocolVersion,
  SessionConfigId,
  SessionConfigOption,
  SessionId,
  SessionInfo,
  SessionModeId,
  SessionModelState,
  SessionModeState,
  StopReason,
  Usage,
} from './common.ts';
import { ContentBlock } from './contentBlock.ts';
import { ClientCapabilities } from './elicitation.ts';

const AGENT_METHODS = {
  authenticate: 'authenticate',
  initialize: 'initialize',
  logout: 'logout',
  session_cancel: 'session/cancel',
  session_close: 'session/close',
  session_delete: 'session/delete',
  session_list: 'session/list',
  session_load: 'session/load',
  session_new: 'session/new',
  session_prompt: 'session/prompt',
  session_resume: 'session/resume',
  session_set_config_option: 'session/set_config_option',
  session_set_mode: 'session/set_mode',
} as const;

/** Unstable ACP model switch (Gemini `unstable_setSessionModel`). Not in stable AgentRpcs. */
export const SESSION_SET_MODEL_METHOD = 'session/set_model' as const;

/** Unstable ACP session fork. Not in stable AgentRpcs. */
export const SESSION_FORK_METHOD = 'session/fork' as const;

/** AIR `_session/archive`. Not in stable AgentRpcs. */
export const SESSION_ARCHIVE_METHOD = '_session/archive' as const;

// =============================================================================
// Payload schemas
// =============================================================================

export class InitializeRequest extends Schema.Opaque<InitializeRequest>()(
  Schema.Struct({
    _meta: MetaField,
    clientCapabilities: optional(ClientCapabilities),
    clientInfo: optional(Schema.NullOr(Implementation)),
    protocolVersion: ProtocolVersion,
  }),
) {}

export class InitializeResponse extends Schema.Opaque<InitializeResponse>()(
  Schema.Struct({
    _meta: MetaField,
    agentCapabilities: optional(AgentCapabilities),
    agentInfo: optional(Schema.NullOr(Implementation)),
    authMethods: optional(Schema.Array(AuthMethod)),
    protocolVersion: ProtocolVersion,
  }),
) {}

export class AuthenticateRequest extends Schema.Opaque<AuthenticateRequest>()(
  Schema.Struct({
    _meta: MetaField,
    methodId: AuthMethodId,
  }),
) {}

export const AuthenticateResponse = EmptyResult;
export type AuthenticateResponse = EmptyResult;

export const LogoutRequest = EmptyResult;
export type LogoutRequest = EmptyResult;

export const LogoutResponse = EmptyResult;
export type LogoutResponse = EmptyResult;

export class NewSessionRequest extends Schema.Opaque<NewSessionRequest>()(
  Schema.Struct({
    _meta: MetaField,
    additionalDirectories: optional(Schema.Array(Schema.String)),
    cwd: Schema.String,
    mcpServers: Schema.Array(McpServer),
  }),
) {}

export class NewSessionResponse extends Schema.Opaque<NewSessionResponse>()(
  Schema.Struct({
    _meta: MetaField,
    configOptions: optional(Schema.NullOr(Schema.Array(SessionConfigOption))),
    models: optional(Schema.NullOr(SessionModelState)),
    modes: optional(Schema.NullOr(SessionModeState)),
    sessionId: SessionId,
  }),
) {}

export class LoadSessionRequest extends Schema.Opaque<LoadSessionRequest>()(
  Schema.Struct({
    _meta: MetaField,
    additionalDirectories: optional(Schema.Array(Schema.String)),
    cwd: Schema.String,
    mcpServers: Schema.Array(McpServer),
    sessionId: SessionId,
  }),
) {}

export class LoadSessionResponse extends Schema.Opaque<LoadSessionResponse>()(
  Schema.Struct({
    _meta: MetaField,
    configOptions: optional(Schema.NullOr(Schema.Array(SessionConfigOption))),
    models: optional(Schema.NullOr(SessionModelState)),
    modes: optional(Schema.NullOr(SessionModeState)),
  }),
) {}

/** Unstable: request options align with `session/load`. */
export class ForkSessionRequest extends Schema.Opaque<ForkSessionRequest>()(
  Schema.Struct({
    _meta: MetaField,
    additionalDirectories: optional(Schema.Array(Schema.String)),
    cwd: Schema.String,
    mcpServers: Schema.Array(McpServer),
    sessionId: SessionId,
  }),
) {}

/** Unstable: response aligns with `session/new` (sessionId + optional config/modes). */
export class ForkSessionResponse extends Schema.Opaque<ForkSessionResponse>()(
  Schema.Struct({
    _meta: MetaField,
    configOptions: optional(Schema.NullOr(Schema.Array(SessionConfigOption))),
    modes: optional(Schema.NullOr(SessionModeState)),
    sessionId: SessionId,
  }),
) {}

export class ListSessionsRequest extends Schema.Opaque<ListSessionsRequest>()(
  Schema.Struct({
    _meta: MetaField,
    cursor: optional(Schema.NullOr(Schema.String)),
    cwd: optional(Schema.NullOr(Schema.String)),
  }),
) {}

export class ListSessionsResponse extends Schema.Opaque<ListSessionsResponse>()(
  Schema.Struct({
    _meta: MetaField,
    nextCursor: optional(Schema.NullOr(Schema.String)),
    sessions: Schema.Array(SessionInfo),
  }),
) {}

export class DeleteSessionRequest extends Schema.Opaque<DeleteSessionRequest>()(
  Schema.Struct({
    _meta: MetaField,
    sessionId: SessionId,
  }),
) {}

export const DeleteSessionResponse = EmptyResult;
export type DeleteSessionResponse = EmptyResult;

export class ResumeSessionRequest extends Schema.Opaque<ResumeSessionRequest>()(
  Schema.Struct({
    _meta: MetaField,
    additionalDirectories: optional(Schema.Array(Schema.String)),
    cwd: Schema.String,
    mcpServers: optional(Schema.Array(McpServer)),
    sessionId: SessionId,
  }),
) {}

export class ResumeSessionResponse extends Schema.Opaque<ResumeSessionResponse>()(
  Schema.Struct({
    _meta: MetaField,
    configOptions: optional(Schema.NullOr(Schema.Array(SessionConfigOption))),
    modes: optional(Schema.NullOr(SessionModeState)),
  }),
) {}

export class CloseSessionRequest extends Schema.Opaque<CloseSessionRequest>()(
  Schema.Struct({
    _meta: MetaField,
    sessionId: SessionId,
  }),
) {}

export const CloseSessionResponse = EmptyResult;
export type CloseSessionResponse = EmptyResult;

export class SetSessionModeRequest extends Schema.Opaque<SetSessionModeRequest>()(
  Schema.Struct({
    _meta: MetaField,
    modeId: SessionModeId,
    sessionId: SessionId,
  }),
) {}

export const SetSessionModeResponse = EmptyResult;
export type SetSessionModeResponse = EmptyResult;

export class SetSessionModelRequest extends Schema.Opaque<SetSessionModelRequest>()(
  Schema.Struct({
    _meta: MetaField,
    modelId: Schema.String,
    sessionId: SessionId,
  }),
) {}

export const SetSessionModelResponse = EmptyResult;
export type SetSessionModelResponse = EmptyResult;

export const SetSessionConfigOptionRequest = Schema.Union([
  Schema.Struct({
    _meta: MetaField,
    configId: SessionConfigId,
    sessionId: SessionId,
    type: Schema.Literals(['boolean']),
    value: Schema.Boolean,
  }),
  Schema.Struct({
    _meta: MetaField,
    configId: SessionConfigId,
    sessionId: SessionId,
    value: Schema.String,
  }),
]);
export type SetSessionConfigOptionRequest = typeof SetSessionConfigOptionRequest.Type;

export class SetSessionConfigOptionResponse extends Schema.Opaque<SetSessionConfigOptionResponse>()(
  Schema.Struct({
    _meta: MetaField,
    configOptions: Schema.Array(SessionConfigOption),
  }),
) {}

export class PromptRequest extends Schema.Opaque<PromptRequest>()(
  Schema.Struct({
    _meta: MetaField,
    prompt: Schema.Array(ContentBlock),
    sessionId: SessionId,
  }),
) {}

export class PromptResponse extends Schema.Opaque<PromptResponse>()(
  Schema.Struct({
    _meta: MetaField,
    stopReason: StopReason,
    usage: optional(Schema.NullOr(Usage)),
  }),
) {}

export class CancelNotification extends Schema.Opaque<CancelNotification>()(
  Schema.Struct({
    _meta: MetaField,
    sessionId: SessionId,
  }),
) {}

// =============================================================================
// Rpc classes
// =============================================================================

export class Initialize extends Rpc.make(AGENT_METHODS.initialize, {
  error: AcpError,
  payload: InitializeRequest,
  success: InitializeResponse,
}) {}

export class Authenticate extends Rpc.make(AGENT_METHODS.authenticate, {
  error: AcpError,
  payload: AuthenticateRequest,
  success: AuthenticateResponse,
}) {}

export class Logout extends Rpc.make(AGENT_METHODS.logout, {
  error: AcpError,
  payload: LogoutRequest,
  success: LogoutResponse,
}) {}

export class SessionNew extends Rpc.make(AGENT_METHODS.session_new, {
  error: AcpError,
  payload: NewSessionRequest,
  success: NewSessionResponse,
}) {}

export class SessionLoad extends Rpc.make(AGENT_METHODS.session_load, {
  error: AcpError,
  payload: LoadSessionRequest,
  success: LoadSessionResponse,
}) {}

export class SessionList extends Rpc.make(AGENT_METHODS.session_list, {
  error: AcpError,
  payload: ListSessionsRequest,
  success: ListSessionsResponse,
}) {}

export class SessionDelete extends Rpc.make(AGENT_METHODS.session_delete, {
  error: AcpError,
  payload: DeleteSessionRequest,
  success: DeleteSessionResponse,
}) {}

export class SessionResume extends Rpc.make(AGENT_METHODS.session_resume, {
  error: AcpError,
  payload: ResumeSessionRequest,
  success: ResumeSessionResponse,
}) {}

export class SessionClose extends Rpc.make(AGENT_METHODS.session_close, {
  error: AcpError,
  payload: CloseSessionRequest,
  success: CloseSessionResponse,
}) {}

/** AIR `_session/archive`. Keep out of AgentRequestRpcs; Client via connectAcpAgent.sessionArchive. */
export class SessionArchive extends Rpc.make(SESSION_ARCHIVE_METHOD, {
  error: AcpError,
  payload: CloseSessionRequest,
  success: CloseSessionResponse,
}) {}

export class SessionSetMode extends Rpc.make(AGENT_METHODS.session_set_mode, {
  error: AcpError,
  payload: SetSessionModeRequest,
  success: SetSessionModeResponse,
}) {}

/** Unstable: keep out of AgentRequestRpcs allowlist; Client→Gemini via connectAcpAgent only. */
export class SessionSetModel extends Rpc.make(SESSION_SET_MODEL_METHOD, {
  error: AcpError,
  payload: SetSessionModelRequest,
  success: SetSessionModelResponse,
}) {}

/** Unstable: keep out of AgentRequestRpcs allowlist; Client via connectAcpAgent.sessionFork. */
export class SessionFork extends Rpc.make(SESSION_FORK_METHOD, {
  error: AcpError,
  payload: ForkSessionRequest,
  success: ForkSessionResponse,
}) {}

export class SessionSetConfigOption extends Rpc.make(AGENT_METHODS.session_set_config_option, {
  error: AcpError,
  payload: SetSessionConfigOptionRequest,
  success: SetSessionConfigOptionResponse,
}) {}

export class SessionPrompt extends Rpc.make(AGENT_METHODS.session_prompt, {
  error: AcpError,
  payload: PromptRequest,
  success: PromptResponse,
}) {}

export class SessionCancel extends Rpc.make(AGENT_METHODS.session_cancel, {
  payload: CancelNotification,
}) {}
