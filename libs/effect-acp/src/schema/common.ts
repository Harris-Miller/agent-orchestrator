import { Option, Schema, SchemaGetter } from 'effect';

/**
 * Optional struct field; explicit `undefined` is omitted when encoding.
 */
export const optional = <S extends Schema.Constraint>(
  schema: S,
): Schema.decodeTo<Schema.optional<S>, Schema.optionalKey<S>> =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.optional(schema), {
      decode: SchemaGetter.passthrough(),
      encode: SchemaGetter.transformOptional(Option.flatMap(Option.fromUndefinedOr)),
    }),
  );

/** ACP `_meta` object map. */
export const MetaObject = Schema.Record(Schema.String, Schema.Unknown);
export type MetaObject = typeof MetaObject.Type;

/** Optional ACP `_meta?: Record | null`. */
export const MetaField = optional(Schema.NullOr(MetaObject));

/** Empty / `_meta`-only result envelope. */
export const EmptyResult = Schema.Struct({
  _meta: MetaField,
});
export type EmptyResult = typeof EmptyResult.Type;

/** JSON-RPC / ACP error (`code`, `message`, optional `data`). */
export const AcpError = Schema.Struct({
  code: Schema.Number,
  data: optional(Schema.Unknown),
  message: Schema.String,
});
export type AcpError = typeof AcpError.Type;

export const RequestId = Schema.Union([Schema.Null, Schema.Number, Schema.String]);
export type RequestId = typeof RequestId.Type;

export const SessionId = Schema.String;
export type SessionId = typeof SessionId.Type;

export const TerminalId = Schema.String;
export type TerminalId = typeof TerminalId.Type;

export const AuthMethodId = Schema.String;
export type AuthMethodId = typeof AuthMethodId.Type;

export const SessionModeId = Schema.String;
export type SessionModeId = typeof SessionModeId.Type;

export const SessionConfigId = Schema.String;
export type SessionConfigId = typeof SessionConfigId.Type;

export const PermissionOptionId = Schema.String;
export type PermissionOptionId = typeof PermissionOptionId.Type;

export const ElicitationId = Schema.String;
export type ElicitationId = typeof ElicitationId.Type;

export const ProtocolVersion = Schema.Number;
export type ProtocolVersion = typeof ProtocolVersion.Type;

export const StopReason = Schema.Literals(['end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled']);
export type StopReason = typeof StopReason.Type;

export const PermissionOptionKind = Schema.Literals(['allow_once', 'allow_always', 'reject_once', 'reject_always']);
export type PermissionOptionKind = typeof PermissionOptionKind.Type;

export class Implementation extends Schema.Opaque<Implementation>()(
  Schema.Struct({
    _meta: MetaField,
    name: Schema.String,
    title: optional(Schema.NullOr(Schema.String)),
    version: Schema.String,
  }),
) {}

export class EnvVariable extends Schema.Opaque<EnvVariable>()(
  Schema.Struct({
    _meta: MetaField,
    name: Schema.String,
    value: Schema.String,
  }),
) {}

export class PermissionOption extends Schema.Opaque<PermissionOption>()(
  Schema.Struct({
    _meta: MetaField,
    kind: PermissionOptionKind,
    name: Schema.String,
    optionId: PermissionOptionId,
  }),
) {}

export class SessionInfo extends Schema.Opaque<SessionInfo>()(
  Schema.Struct({
    _meta: MetaField,
    additionalDirectories: optional(Schema.Array(Schema.String)),
    cwd: Schema.String,
    sessionId: SessionId,
    title: optional(Schema.NullOr(Schema.String)),
    updatedAt: optional(Schema.NullOr(Schema.String)),
  }),
) {}

export class TerminalExitStatus extends Schema.Opaque<TerminalExitStatus>()(
  Schema.Struct({
    _meta: MetaField,
    exitCode: optional(Schema.NullOr(Schema.Number)),
    signal: optional(Schema.NullOr(Schema.String)),
  }),
) {}

/** Opaque placeholders for large nested unions (expand later). */
export class SessionUpdate extends Schema.Opaque<SessionUpdate>()(Schema.Unknown) {}
export class AgentCapabilities extends Schema.Opaque<AgentCapabilities>()(Schema.Unknown) {}
export class AuthMethod extends Schema.Opaque<AuthMethod>()(Schema.Unknown) {}
export class McpServer extends Schema.Opaque<McpServer>()(Schema.Unknown) {}
export class SessionConfigOption extends Schema.Opaque<SessionConfigOption>()(Schema.Unknown) {}
export class SessionModeState extends Schema.Opaque<SessionModeState>()(Schema.Unknown) {}
/** Gemini (and similar) legacy model list on session/new|load; not part of stable ACP AgentRpcs. */
export class SessionModelState extends Schema.Opaque<SessionModelState>()(Schema.Unknown) {}
export class ToolCallUpdate extends Schema.Opaque<ToolCallUpdate>()(Schema.Unknown) {}
export class Usage extends Schema.Opaque<Usage>()(Schema.Unknown) {}
