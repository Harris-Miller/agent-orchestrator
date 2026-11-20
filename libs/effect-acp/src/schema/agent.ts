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

const ListSessionsMetaField = optional(
  Schema.NullOr(
    Schema.Struct({
      jetbrains: Schema.Struct({
        air: Schema.Struct({
          list: Schema.Struct({
            archived: Schema.Literals(['unarchived', 'archived', 'all']),
            limit: optional(Schema.Number),
          }),
          version: Schema.Literal(1),
        }),
      }),
    }),
  ),
);

/** Unstable ACP model switch (Gemini `unstable_setSessionModel`). Not in stable AgentRpcs. */
export const SESSION_SET_MODEL_METHOD = 'session/set_model' as const;

/** Unstable ACP session fork. Not in stable AgentRpcs. */
export const SESSION_FORK_METHOD = 'session/fork' as const;

/** AIR `_session/archive`. Not in stable AgentRpcs. */
export const SESSION_ARCHIVE_METHOD = '_session/archive' as const;

/** AIR `_session/unarchive`. Not in stable AgentRpcs. */
export const SESSION_UNARCHIVE_METHOD = '_session/unarchive' as const;

/** AIR `_session/rename`. Not in stable AgentRpcs. */
export const SESSION_RENAME_METHOD = '_session/rename' as const;

/** AIR `_session/list/subscribe`. Not in stable AgentRpcs. */
export const SESSION_LIST_SUBSCRIBE_METHOD = '_session/list/subscribe' as const;

/** AIR `_session/list/unsubscribe`. Not in stable AgentRpcs. */
export const SESSION_LIST_UNSUBSCRIBE_METHOD = '_session/list/unsubscribe' as const;

/** Claude/Codex `_session/steering`. Not in stable AgentRpcs. */
export const SESSION_STEERING_METHOD = '_session/steering' as const;

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
    _meta: ListSessionsMetaField,
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

/** `sessionId` plus `_meta`. Shared by `session/close`, `_session/archive` and `_session/unarchive`. */
const sessionIdRequest = Schema.Struct({
  _meta: MetaField,
  sessionId: SessionId,
});

export class CloseSessionRequest extends Schema.Opaque<CloseSessionRequest>()(sessionIdRequest) {}

export const CloseSessionResponse = EmptyResult;
export type CloseSessionResponse = EmptyResult;

export class SessionArchiveRequest extends Schema.Opaque<SessionArchiveRequest>()(sessionIdRequest) {}

export const SessionArchiveResponse = EmptyResult;
export type SessionArchiveResponse = EmptyResult;

export class SessionUnarchiveRequest extends Schema.Opaque<SessionUnarchiveRequest>()(sessionIdRequest) {}

export const SessionUnarchiveResponse = EmptyResult;
export type SessionUnarchiveResponse = EmptyResult;

export class SessionListSubscribeRequest extends Schema.Opaque<SessionListSubscribeRequest>()(
  Schema.Struct({
    _meta: MetaField,
    cwd: Schema.String,
  }),
) {}

export class SessionListSubscribeResponse extends Schema.Opaque<SessionListSubscribeResponse>()(
  Schema.Struct({
    _meta: MetaField,
    subscriptionId: Schema.String,
  }),
) {}

export class SessionListUnsubscribeRequest extends Schema.Opaque<SessionListUnsubscribeRequest>()(
  Schema.Struct({
    _meta: MetaField,
    subscriptionId: Schema.String,
  }),
) {}

export const SessionListUnsubscribeResponse = EmptyResult;
export type SessionListUnsubscribeResponse = EmptyResult;

export class SessionRenameRequest extends Schema.Opaque<SessionRenameRequest>()(
  Schema.Struct({
    _meta: MetaField,
    sessionId: SessionId,
    title: Schema.String,
  }),
) {}

export const SessionRenameResponse = EmptyResult;
export type SessionRenameResponse = EmptyResult;

/** `prompt` is injected into the in-flight turn; `_meta.steering.idleBehavior` opts into `promptRequired` when idle. */
export class SessionSteeringRequest extends Schema.Opaque<SessionSteeringRequest>()(
  Schema.Struct({
    _meta: MetaField,
    prompt: Schema.Array(ContentBlock),
    sessionId: SessionId,
  }),
) {}

/**
 * `injected`: message went into the running turn.
 * `promptRequired`: no running turn; Client must send a normal `session/prompt`.
 * `startedNewTurn`: legacy default when idleBehavior is omitted (detached turn, no `session/prompt` response).
 */
export const SessionSteeringResponse = Schema.Union([
  Schema.Struct({ outcome: Schema.Literal('injected') }),
  Schema.Struct({ outcome: Schema.Literal('promptRequired'), reason: optional(Schema.String) }),
  Schema.Struct({ outcome: Schema.Literal('startedNewTurn') }),
]);
export type SessionSteeringResponse = typeof SessionSteeringResponse.Type;

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
  payload: SessionArchiveRequest,
  success: SessionArchiveResponse,
}) {}

/** AIR `_session/unarchive`. Keep out of AgentRequestRpcs; Client via connectAcpAgent.sessionUnarchive. */
export class SessionUnarchive extends Rpc.make(SESSION_UNARCHIVE_METHOD, {
  error: AcpError,
  payload: SessionUnarchiveRequest,
  success: SessionUnarchiveResponse,
}) {}

/** AIR `_session/rename`. Keep out of AgentRequestRpcs; Client via connectAcpAgent.sessionRename. */
export class SessionRename extends Rpc.make(SESSION_RENAME_METHOD, {
  error: AcpError,
  payload: SessionRenameRequest,
  success: SessionRenameResponse,
}) {}

/** AIR `_session/list/subscribe`. Keep out of AgentRequestRpcs; Client via connectAcpAgent.sessionListSubscribe. */
export class SessionListSubscribe extends Rpc.make(SESSION_LIST_SUBSCRIBE_METHOD, {
  error: AcpError,
  payload: SessionListSubscribeRequest,
  success: SessionListSubscribeResponse,
}) {}

/** AIR `_session/list/unsubscribe`. Keep out of AgentRequestRpcs; Client via connectAcpAgent.sessionListUnsubscribe. */
export class SessionListUnsubscribe extends Rpc.make(SESSION_LIST_UNSUBSCRIBE_METHOD, {
  error: AcpError,
  payload: SessionListUnsubscribeRequest,
  success: SessionListUnsubscribeResponse,
}) {}

/** Claude/Codex `_session/steering`. Keep out of AgentRequestRpcs; Client via connectAcpAgent.sessionSteering. */
export class SessionSteering extends Rpc.make(SESSION_STEERING_METHOD, {
  error: AcpError,
  payload: SessionSteeringRequest,
  success: SessionSteeringResponse,
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
