/**
 * Wire contract between the hub and its Harness clients (`/clients` WebSocket), the tool argument schemas both sides
 * decode with, and the constants they share. No Node imports: Harness WebViews import this through `@lib/hub/protocol`.
 */
import { Schema } from 'effect';

export const HUB_APP_ID = 'agent-orchestrator-hub';
/** Bumped on any incompatible change to `/clients` messages or tool schemas; a mismatch is refused, never half-working. */
export const PROTOCOL_VERSION = 1;
export const DEFAULT_HUB_PORT = 47821;
export const HUB_HOST = '127.0.0.1';
/** Distinctive on purpose: Codex skips injected servers whose name already exists in the user's own config. */
export const MCP_SERVER_NAME = 'hoa-hub';
/** Discovery file under the HOA home (`~/.hoa`), written by the hub after it binds, readable only by the owner. */
export const DISCOVERY_FILENAME = 'hub.json';

export const HealthPayload = Schema.Struct({
  app: Schema.Literal(HUB_APP_ID),
  /** Lets a client tell this hub's discovery file from one a crashed predecessor left behind. */
  pid: Schema.Number,
  protocolVersion: Schema.Number,
});
export type HealthPayload = typeof HealthPayload.Type;

export const Discovery = Schema.Struct({
  pid: Schema.Number,
  port: Schema.Number,
  protocolVersion: Schema.Number,
  secret: Schema.String,
});
export type Discovery = typeof Discovery.Type;

/** Which kind of Harness a `/clients` connection is (handshake `clientKind`); lets later tools pick a target client. */
export const ClientKind = Schema.Literals(['desktop', 'vscode', 'test']);
export type ClientKind = typeof ClientKind.Type;

// ---------------------------------------------------------------------------------------------------------------------
// Tools. The hub advertises these to agents and forwards calls verbatim; the Harness decodes `args` with the same schema.
// Adding a tool: add its argument schema here, a `Tool.make` entry in the hub's `tools.ts`, and a Harness handler.
// ---------------------------------------------------------------------------------------------------------------------

/** Far above any real handoff; an oversize document comes back to the agent as invalid params instead of a 413. */
export const MAX_HANDOFF_DOCUMENT_CHARS = 100_000;

export const SubmitHandoffArgs = Schema.Struct({
  document: Schema.String.check(Schema.isMaxLength(MAX_HANDOFF_DOCUMENT_CHARS)).annotate({
    description: `The complete handoff document, as Markdown (at most ${MAX_HANDOFF_DOCUMENT_CHARS} characters).`,
  }),
});

export const HUB_TOOL_NAMES = ['submit_handoff'] as const;
export type HubToolName = (typeof HUB_TOOL_NAMES)[number];

// ---------------------------------------------------------------------------------------------------------------------
// `/clients` messages
// ---------------------------------------------------------------------------------------------------------------------

/** Client → hub. */
export const ClientMessage = Schema.Union([
  Schema.Struct({ token: Schema.String, type: Schema.Literal('register') }),
  Schema.Struct({
    launchTarget: Schema.String,
    sessionId: Schema.String,
    token: Schema.String,
    type: Schema.Literal('bind'),
  }),
  Schema.Struct({ token: Schema.String, type: Schema.Literal('revoke') }),
  Schema.Struct({
    isError: Schema.Boolean,
    requestId: Schema.String,
    text: Schema.String,
    type: Schema.Literal('toolResult'),
  }),
]);
export type ClientMessage = typeof ClientMessage.Type;

/** Hub → client: a tool call routed to the client that owns `token`. */
export const ToolCallMessage = Schema.Struct({
  args: Schema.Unknown,
  requestId: Schema.String,
  token: Schema.String,
  tool: Schema.String,
  type: Schema.Literal('toolCall'),
});
export type ToolCallMessage = typeof ToolCallMessage.Type;

/**
 * Hub → client answer to `register`. `accepted: false` means another client already owns the token. A session RPC
 * must not start before an accepted answer, or the agent's first MCP request can 401.
 */
export const RegisteredMessage = Schema.Struct({
  accepted: Schema.Boolean,
  token: Schema.String,
  type: Schema.Literal('registered'),
});

export const HubMessage = Schema.Union([ToolCallMessage, RegisteredMessage]);
export type HubMessage = typeof HubMessage.Type;

/** `/clients` handshake query. The secret travels in the query because browser WebSockets cannot set headers. */
export const clientsQuery = (options: { readonly clientKind: ClientKind; readonly secret: string }): string =>
  new URLSearchParams({
    clientKind: options.clientKind,
    protocolVersion: String(PROTOCOL_VERSION),
    secret: options.secret,
  }).toString();
