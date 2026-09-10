import { Schema } from 'effect';

import { ElicitationId, MetaField, optional, RequestId, SessionId } from './common.ts';

/** Opaque tool-call id string used when scoping elicitation to a tool call. */
const ToolCallId = Schema.String;

export const StringFormat = Schema.Literals([
  'date',
  'date-time',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uri',
  'uri-reference',
  'uuid',
]);
export type StringFormat = typeof StringFormat.Type;

export class EnumOption extends Schema.Opaque<EnumOption>()(
  Schema.Struct({
    _meta: MetaField,
    const: Schema.String,
    title: optional(Schema.NullOr(Schema.String)),
  }),
) {}

export class MultiSelectItems extends Schema.Opaque<MultiSelectItems>()(
  Schema.Struct({
    _meta: MetaField,
    enum: optional(Schema.NullOr(Schema.Array(Schema.String))),
    oneOf: optional(Schema.NullOr(Schema.Array(EnumOption))),
    type: Schema.Literals(['string']),
  }),
) {}

export class ElicitationStringProperty extends Schema.Opaque<ElicitationStringProperty>()(
  Schema.Struct({
    _meta: MetaField,
    default: optional(Schema.NullOr(Schema.String)),
    description: optional(Schema.NullOr(Schema.String)),
    enum: optional(Schema.NullOr(Schema.Array(Schema.String))),
    format: optional(Schema.NullOr(StringFormat)),
    maxLength: optional(Schema.NullOr(Schema.Number)),
    minLength: optional(Schema.NullOr(Schema.Number)),
    oneOf: optional(Schema.NullOr(Schema.Array(EnumOption))),
    pattern: optional(Schema.NullOr(Schema.String)),
    title: optional(Schema.NullOr(Schema.String)),
    type: Schema.Literals(['string']),
  }),
) {}

export class ElicitationNumberProperty extends Schema.Opaque<ElicitationNumberProperty>()(
  Schema.Struct({
    _meta: MetaField,
    default: optional(Schema.NullOr(Schema.Number)),
    description: optional(Schema.NullOr(Schema.String)),
    maximum: optional(Schema.NullOr(Schema.Number)),
    minimum: optional(Schema.NullOr(Schema.Number)),
    title: optional(Schema.NullOr(Schema.String)),
    type: Schema.Literals(['number']),
  }),
) {}

export class ElicitationIntegerProperty extends Schema.Opaque<ElicitationIntegerProperty>()(
  Schema.Struct({
    _meta: MetaField,
    default: optional(Schema.NullOr(Schema.Number)),
    description: optional(Schema.NullOr(Schema.String)),
    maximum: optional(Schema.NullOr(Schema.Number)),
    minimum: optional(Schema.NullOr(Schema.Number)),
    title: optional(Schema.NullOr(Schema.String)),
    type: Schema.Literals(['integer']),
  }),
) {}

export class ElicitationBooleanProperty extends Schema.Opaque<ElicitationBooleanProperty>()(
  Schema.Struct({
    _meta: MetaField,
    default: optional(Schema.NullOr(Schema.Boolean)),
    description: optional(Schema.NullOr(Schema.String)),
    title: optional(Schema.NullOr(Schema.String)),
    type: Schema.Literals(['boolean']),
  }),
) {}

export class ElicitationArrayProperty extends Schema.Opaque<ElicitationArrayProperty>()(
  Schema.Struct({
    _meta: MetaField,
    default: optional(Schema.NullOr(Schema.Array(Schema.String))),
    description: optional(Schema.NullOr(Schema.String)),
    items: MultiSelectItems,
    maxItems: optional(Schema.NullOr(Schema.Number)),
    minItems: optional(Schema.NullOr(Schema.Number)),
    title: optional(Schema.NullOr(Schema.String)),
    type: Schema.Literals(['array']),
  }),
) {}

/** Unknown / extension property schemas — preserve raw payload for forward compatibility. */
export const ElicitationUnknownProperty = Schema.Record(Schema.String, Schema.Unknown);
export type ElicitationUnknownProperty = typeof ElicitationUnknownProperty.Type;

export const ElicitationPropertySchema = Schema.Union([
  ElicitationStringProperty,
  ElicitationNumberProperty,
  ElicitationIntegerProperty,
  ElicitationBooleanProperty,
  ElicitationArrayProperty,
  ElicitationUnknownProperty,
]);
export type ElicitationPropertySchema = typeof ElicitationPropertySchema.Type;

export class ElicitationSchema extends Schema.Opaque<ElicitationSchema>()(
  Schema.Struct({
    _meta: MetaField,
    description: optional(Schema.NullOr(Schema.String)),
    properties: optional(Schema.Record(Schema.String, ElicitationPropertySchema)),
    required: optional(Schema.NullOr(Schema.Array(Schema.String))),
    title: optional(Schema.NullOr(Schema.String)),
    type: optional(Schema.Literals(['object'])),
  }),
) {}

export class ElicitationFormCapabilities extends Schema.Opaque<ElicitationFormCapabilities>()(
  Schema.Struct({
    _meta: MetaField,
  }),
) {}

export class ElicitationUrlCapabilities extends Schema.Opaque<ElicitationUrlCapabilities>()(
  Schema.Struct({
    _meta: MetaField,
  }),
) {}

export class ElicitationCapabilities extends Schema.Opaque<ElicitationCapabilities>()(
  Schema.Struct({
    _meta: MetaField,
    form: optional(Schema.NullOr(ElicitationFormCapabilities)),
    url: optional(Schema.NullOr(ElicitationUrlCapabilities)),
  }),
) {}

export class FileSystemCapabilities extends Schema.Opaque<FileSystemCapabilities>()(
  Schema.Struct({
    _meta: MetaField,
    readTextFile: optional(Schema.Boolean),
    writeTextFile: optional(Schema.Boolean),
  }),
) {}

export class ClientCapabilities extends Schema.Opaque<ClientCapabilities>()(
  Schema.Struct({
    _meta: MetaField,
    auth: optional(Schema.Unknown),
    elicitation: optional(Schema.NullOr(ElicitationCapabilities)),
    fs: optional(FileSystemCapabilities),
    sessionCapabilities: optional(Schema.NullOr(Schema.Unknown)),
    terminal: optional(Schema.Boolean),
  }),
) {}

export const ElicitationContentValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Array(Schema.String),
]);
export type ElicitationContentValue = typeof ElicitationContentValue.Type;

export const ElicitationContent = Schema.Record(Schema.String, ElicitationContentValue);
export type ElicitationContent = typeof ElicitationContent.Type;

const FormModeShared = {
  _meta: MetaField,
  message: Schema.String,
  mode: Schema.Literals(['form'] as const),
  requestedSchema: ElicitationSchema,
};

export class CreateElicitationFormSessionRequest extends Schema.Opaque<CreateElicitationFormSessionRequest>()(
  Schema.Struct({
    ...FormModeShared,
    sessionId: SessionId,
    toolCallId: optional(Schema.NullOr(ToolCallId)),
  }),
) {}

export class CreateElicitationFormRequestScopeRequest extends Schema.Opaque<CreateElicitationFormRequestScopeRequest>()(
  Schema.Struct({
    ...FormModeShared,
    requestId: RequestId,
  }),
) {}

const UrlModeShared = {
  _meta: MetaField,
  elicitationId: ElicitationId,
  message: Schema.String,
  mode: Schema.Literals(['url'] as const),
  url: Schema.String,
};

export class CreateElicitationUrlSessionRequest extends Schema.Opaque<CreateElicitationUrlSessionRequest>()(
  Schema.Struct({
    ...UrlModeShared,
    sessionId: SessionId,
    toolCallId: optional(Schema.NullOr(ToolCallId)),
  }),
) {}

export class CreateElicitationUrlRequestScopeRequest extends Schema.Opaque<CreateElicitationUrlRequestScopeRequest>()(
  Schema.Struct({
    ...UrlModeShared,
    requestId: RequestId,
  }),
) {}

/** Extension / future elicitation modes — preserve unknown payloads. */
export const CreateElicitationUnknownRequest = Schema.Record(Schema.String, Schema.Unknown);
export type CreateElicitationUnknownRequest = typeof CreateElicitationUnknownRequest.Type;

export const CreateElicitationFormRequest = Schema.Union([
  CreateElicitationFormSessionRequest,
  CreateElicitationFormRequestScopeRequest,
]);
export type CreateElicitationFormRequest = typeof CreateElicitationFormRequest.Type;

export const CreateElicitationSessionRequest = Schema.Union([
  CreateElicitationFormSessionRequest,
  CreateElicitationUrlSessionRequest,
]);
export type CreateElicitationSessionRequest = typeof CreateElicitationSessionRequest.Type;

export const CreateElicitationRequestBody = Schema.Union([
  CreateElicitationFormSessionRequest,
  CreateElicitationFormRequestScopeRequest,
  CreateElicitationUrlSessionRequest,
  CreateElicitationUrlRequestScopeRequest,
  CreateElicitationUnknownRequest,
]);
export type CreateElicitationRequestBody = typeof CreateElicitationRequestBody.Type;

export class ElicitationAcceptResponse extends Schema.Opaque<ElicitationAcceptResponse>()(
  Schema.Struct({
    _meta: MetaField,
    action: Schema.Literals(['accept']),
    content: optional(Schema.NullOr(ElicitationContent)),
  }),
) {}

export class ElicitationDeclineResponse extends Schema.Opaque<ElicitationDeclineResponse>()(
  Schema.Struct({
    _meta: MetaField,
    action: Schema.Literals(['decline']),
  }),
) {}

export class ElicitationCancelResponse extends Schema.Opaque<ElicitationCancelResponse>()(
  Schema.Struct({
    _meta: MetaField,
    action: Schema.Literals(['cancel']),
  }),
) {}

export const CreateElicitationResponseBody = Schema.Union([
  ElicitationAcceptResponse,
  ElicitationDeclineResponse,
  ElicitationCancelResponse,
]);
export type CreateElicitationResponseBody = typeof CreateElicitationResponseBody.Type;

/** True when Client advertised form elicitation via a present non-null `form` field. */
export const clientSupportsFormElicitation = (capabilities: unknown): boolean => {
  if (!Schema.is(ClientCapabilities)(capabilities)) {
    return false;
  }
  return capabilities.elicitation?.form != null;
};
