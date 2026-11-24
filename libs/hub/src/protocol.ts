/**
 * Wire contract between the hub and its Harness clients (`/clients` WebSocket), the tool argument schemas both sides
 * decode with, and the constants they share. No Node imports: Harness WebViews import this through `@lib/hub/protocol`.
 */
import { Schema } from 'effect';

export const HUB_APP_ID = 'agent-orchestrator-hub';
/** Bumped on any incompatible change to `/clients` messages or tool schemas; a mismatch is refused, never half-working. */
export const PROTOCOL_VERSION = 3;
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

/**
 * The connecting app instance's id (handshake `appSessionId`; not an ACP session id). Validated to a UUID-like shape
 * because it lands on hub telemetry, which must never carry free text (root ADR 0002).
 */
export const AppSessionId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9-]{1,64}$/));

// ---------------------------------------------------------------------------------------------------------------------
// Tools. The hub advertises these to agents and forwards calls verbatim; the Harness decodes `args` with the same schema.
// Adding a tool: add its argument schema here, a `Tool.make` entry in the hub's `tools.ts`, and a Harness handler.
// ---------------------------------------------------------------------------------------------------------------------

/** Far above any real handoff; an oversize document comes back to the agent as invalid params instead of a 413. */
export const MAX_HANDOFF_DOCUMENT_CHARS = 100_000;

/** Cap on a subagent task (request bodies are capped at 1 MiB) and on the result text sent back to an agent. */
export const MAX_SUBAGENT_TEXT_CHARS = 100_000;

export const SubmitHandoffArgs = Schema.Struct({
  document: Schema.String.check(
    Schema.makeFilter(document => document.trim().length > 0 || 'The handoff document must not be empty.'),
    Schema.isMaxLength(MAX_HANDOFF_DOCUMENT_CHARS),
  ).annotate({
    description: `The complete handoff document, as non-empty Markdown (at most ${MAX_HANDOFF_DOCUMENT_CHARS} characters).`,
  }),
});

/** `list_subagent_targets` takes no arguments (the hub declares it with `Tool.EmptyParams`, which an agent calls with `{}`). */
export const ListSubagentTargetsArgs = Schema.Struct({});

/** The longest a single `wait_subagent` (and a foreground `spawn_subagent`) holds a call open: under Codex's 300 s MCP tool timeout. */
export const MAX_SUBAGENT_WAIT_MS = 240_000;

export const SpawnSubagentArgs = Schema.Struct({
  configOptions: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Boolean])),
  ).annotate({
    description:
      'Config option values for the subagent, keyed by option id (e.g. { "model": "gpt-5", "effort": "high" }), as listed by list_subagent_targets. Omit for the target defaults.',
  }),
  description: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)).annotate({
    description: 'A short (3-5 word) name for the subagent, shown to the user.',
  }),
  /** A string: the launch target type lives in `@lib/ui`, the handler validates it. */
  launchTarget: Schema.String.annotate({
    description: 'The launch target to run the subagent on, as listed by list_subagent_targets.',
  }),
  runInBackground: Schema.optionalKey(Schema.Boolean).annotate({
    description:
      'When true, return at once with the subagent id; its result arrives later as a <subagent-report> message. Default false: wait for the result.',
  }),
  task: Schema.String.check(
    Schema.makeFilter(task => task.trim().length > 0 || 'The task must not be empty.'),
    Schema.isMaxLength(MAX_SUBAGENT_TEXT_CHARS),
  ).annotate({
    description: `The complete task for the subagent, as self-contained Markdown (at most ${MAX_SUBAGENT_TEXT_CHARS} characters). It starts with no context but the working directory.`,
  }),
});

export const CancelSubagentArgs = Schema.Struct({
  subagentId: Schema.String.annotate({ description: 'The id of a subagent you started with spawn_subagent.' }),
});

export const WaitSubagentArgs = Schema.Struct({
  ids: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(16)).annotate({
    description: 'The subagent ids (as returned by spawn_subagent) to wait for.',
  }),
  timeoutMs: Schema.optionalKey(Schema.Number).annotate({
    description: `How long to wait, in milliseconds (at most ${MAX_SUBAGENT_WAIT_MS}; the default and the maximum).`,
  }),
});

export const HUB_TOOL_NAMES = [
  'submit_handoff',
  'list_subagent_targets',
  'spawn_subagent',
  'cancel_subagent',
  'wait_subagent',
] as const;
export type HubToolName = (typeof HUB_TOOL_NAMES)[number];

/** The label for a value outside a closed set (an unlisted tool, a missing or malformed service version). */
export const UNKNOWN_LABEL = 'unknown';

/** A tool name from the allowlist, else `unknown`: the name arrives from the agent and must never be free text. */
export const toolLabel = (name: string): string =>
  HUB_TOOL_NAMES.some(known => known === name) ? name : UNKNOWN_LABEL;

// ---------------------------------------------------------------------------------------------------------------------
// `/clients` messages
// ---------------------------------------------------------------------------------------------------------------------

/** Client → hub. */
export const ClientMessage = Schema.Union([
  Schema.Struct({ token: Schema.String, type: Schema.Literal('register') }),
  Schema.Struct({
    launchTarget: Schema.String,
    /** The parent's ACP `sessionId` when this session is a Spawned subagent session; lets hub spans link child to parent. */
    parentSessionId: Schema.optionalKey(Schema.String),
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

export const TraceContext = Schema.Struct({
  sampled: Schema.Boolean,
  spanId: Schema.String.check(Schema.isPattern(/^[0-9a-f]{16}$/)),
  traceId: Schema.String.check(Schema.isPattern(/^[0-9a-f]{32}$/)),
});
export type TraceContext = typeof TraceContext.Type;

/** Hub → client: a tool call routed to the client that owns `token`. */
export const ToolCallMessage = Schema.Struct({
  args: Schema.Unknown,
  requestId: Schema.String,
  token: Schema.String,
  /**
   * The hub's `hub.toolCall` span for this call, so the Harness can handle the call as a child of it (one trace). Ids
   * and the sampling flag only, validated to hex because it lands on Harness telemetry (root ADR 0002). Optional added to
   * v3 without a bump (unreleased protocol, like `parentSessionId`).
   */
  trace: Schema.optionalKey(TraceContext),
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
export const clientsQuery = (options: {
  readonly appSessionId: string;
  readonly clientKind: ClientKind;
  readonly secret: string;
}): string =>
  new URLSearchParams({
    appSessionId: options.appSessionId,
    clientKind: options.clientKind,
    protocolVersion: String(PROTOCOL_VERSION),
    secret: options.secret,
  }).toString();
