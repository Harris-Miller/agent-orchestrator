# effect-acp

Effect library for the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP): typed RPC over newline-delimited JSON-RPC on a child-process stdio duplex.

## This repo

**Orchestrator**:
This project (`agent-orchestrator`). The ACP **Client** in production: it drives the protocol and spawns Agent subprocesses, rather than implementing Agent behavior itself.
_Avoid_: Host, manager, server

## Protocol roles

**Client**:
The party that spawns an Agent subprocess and drives the protocol — calling `initialize`, opening sessions, sending prompts, and handling Agent-initiated requests (filesystem, terminal, permissions). In this repo, the Client is the **Orchestrator**. Use **Client** in protocol-facing code (`ClientRpcs`, `connectAcpAgent`); use **Orchestrator** for repo and application naming.
_Avoid_: Host, parent, caller

**Agent**:
A subprocess that implements ACP methods (`session/new`, `session/prompt`, …) and may call back into the Client (`session/update`, `fs/read_text_file`, …). Communicates over stdin/stdout. Production Agents (Cursor, Claude Code, …) are external; the only in-repo Agent is the private test fixture `jsonrpc-echo`.
_Avoid_: Server, worker, model

## Sessions and turns

**Session**:
A bounded conversation context between Client and Agent, identified by `sessionId`. Created via `session/new`; prompts and updates are scoped to a session.
_Avoid_: Thread, chat, conversation

**Working directory**:
The absolute `cwd` passed on `session/new`, `session/load`, and `session/resume` — the session's primary filesystem context and base for relative paths. Must stay consistent for that session across load/resume.
_Avoid_: Host cwd, spawn directory, project root (ambiguous)

**Prompt**:
Content blocks the Client sends to the Agent within a session via `session/prompt`.
_Avoid_: Message, input, query

**Turn**:
One handle-a-prompt cycle within a session — from `session/prompt` through the stream of session updates until the Agent returns a stop reason.
_Avoid_: Round, exchange, iteration

**Stop reason**:
Why the Agent ended its turn after handling a prompt (`end_turn`, `cancelled`, `max_tokens`, …).
_Avoid_: Finish reason, completion reason

**Session update**:
An Agent→Client `session/update` notification emitted while a turn is in flight. Each payload is discriminated by `sessionUpdate` (e.g. `agent_message_chunk`, `tool_call`, `plan`, `usage_update`) and streams incremental progress for that turn.
_Avoid_: Event, delta, chunk, message

**Tool call**:
An Agent action during a turn, announced via `tool_call` / `tool_call_update` session updates and identified by `toolCallId`.
_Avoid_: Function call, invocation, plugin

## Agent-initiated interactions

**Permission request**:
An Agent→Client call (`session/request_permission`) asking the user to approve or reject a tool call, with selectable options.
_Avoid_: Approval, auth request

**Elicitation**:
An Agent→Client flow for gathering structured input from the user (`elicitation/create` → `elicitation/complete`).
_Avoid_: Form, user prompt

## Wire and API surface

**Toward Agent**:
Messages the Client writes and the Agent reads on the stdio duplex (Client→Agent requests and notifications).
_Avoid_: Inbound, upstream (ambiguous without perspective)

**Toward Client**:
Messages the Agent writes and the Client reads on the stdio duplex (Agent→Client requests, responses, and notifications).
_Avoid_: Outbound, downstream

**Agent RPCs**:
RPC group for methods the Client invokes on the Agent (`initialize`, `session/new`, `session/prompt`, …).
_Avoid_: Server RPCs, agent handlers

**Client RPCs**:
RPC group for methods the Agent invokes on the Client (`session/update`, `fs/read_text_file`, `terminal/create`, …).
_Avoid_: Client handlers, callback RPCs

**Transport**:
The newline-delimited JSON-RPC byte stream over a child process's stdin/stdout.
_Avoid_: Pipe, socket

**Connection**:
The full duplex ACP link: transport plus demux routing and typed RPC client/server endpoints (`connectAcpAgent`).
_Avoid_: Session, link
