/**
 * ACP v1 schema + RPC authoring surface (stable methods only).
 *
 * Modeled on Effect `McpSchema`: domain schemas, `Rpc.make` procedures,
 * directional `RpcGroup`s, and encoded duplex message unions.
 */
import type { Rpc } from 'effect/rpc';
import { RpcGroup } from 'effect/rpc';

import {
  Authenticate,
  Initialize,
  Logout,
  SessionArchive,
  SessionCancel,
  SessionClose,
  SessionDelete,
  SessionFork,
  SessionList,
  SessionLoad,
  SessionNew,
  SessionPrompt,
  SessionRename,
  SessionResume,
  SessionSetConfigOption,
  SessionSetMode,
  SessionSetModel,
  SessionSteering,
} from './schema/agent.ts';
import {
  ElicitationComplete,
  ElicitationCreate,
  FsReadTextFile,
  FsWriteTextFile,
  SessionRequestPermission,
  SessionUpdateNotification,
  TerminalCreate,
  TerminalKill,
  TerminalOutput,
  TerminalRelease,
  TerminalWaitForExit,
} from './schema/client.ts';
import { CancelRequest } from './schema/protocol.ts';

export * from './schema/agent.ts';
export * from './schema/client.ts';
export * from './schema/common.ts';
export * from './schema/contentBlock.ts';
export * from './schema/elicitation.ts';
export * from './schema/protocol.ts';
export * from './schema/subagent.ts';

// =============================================================================
// Encoded helpers
// =============================================================================

/**
 * Encoded JSON-RPC request message for an RPC in `Group`.
 */
export type RequestEncoded<Group extends RpcGroup.Any> =
  RpcGroup.Rpcs<Group> extends infer Rpc_
    ? Rpc_ extends Rpc.Rpc<infer _Tag, infer _Payload, infer _Success, infer _Error, infer _Middleware>
      ? {
          readonly _tag: 'Request';
          readonly id: number | string;
          readonly method: _Tag;
          readonly payload: _Payload['Encoded'];
        }
      : never
    : never;

/**
 * Encoded notification message for an RPC in `Group` (no request id).
 */
export type NotificationEncoded<Group extends RpcGroup.Any> =
  RpcGroup.Rpcs<Group> extends infer Rpc_
    ? Rpc_ extends Rpc.Rpc<infer _Tag, infer _Payload, infer _Success, infer _Error, infer _Middleware>
      ? {
          readonly _tag: 'Notification';
          readonly method: _Tag;
          readonly payload: _Payload['Encoded'];
        }
      : never
    : never;

/**
 * Encoded success response for an RPC in `Group`.
 */
export type SuccessEncoded<Group extends RpcGroup.Any> =
  RpcGroup.Rpcs<Group> extends infer Rpc_
    ? Rpc_ extends Rpc.Rpc<infer _Tag, infer _Payload, infer _Success, infer _Error, infer _Middleware>
      ? {
          readonly _tag: 'Success';
          readonly id: number | string;
          readonly result: _Success['Encoded'];
        }
      : never
    : never;

/**
 * Encoded failure response for an RPC in `Group`.
 */
export type FailureEncoded<Group extends RpcGroup.Any> =
  RpcGroup.Rpcs<Group> extends infer Rpc_
    ? Rpc_ extends Rpc.Rpc<infer _Tag, infer _Payload, infer _Success, infer _Error, infer _Middleware>
      ? {
          readonly _tag: 'Failure';
          readonly error: _Error['Encoded'];
          readonly id: number | string;
        }
      : never
    : never;

// =============================================================================
// Rpc groups
// =============================================================================

/** Client → Agent requests. */
export class AgentRequestRpcs extends RpcGroup.make(
  Initialize,
  Authenticate,
  Logout,
  SessionNew,
  SessionLoad,
  SessionList,
  SessionDelete,
  SessionResume,
  SessionClose,
  SessionSetMode,
  SessionSetConfigOption,
  SessionPrompt,
) {}

/** Client → Agent notifications. */
export class AgentNotificationRpcs extends RpcGroup.make(SessionCancel) {}

/** Agent → Client requests. */
export class ClientRequestRpcs extends RpcGroup.make(
  SessionRequestPermission,
  FsReadTextFile,
  FsWriteTextFile,
  TerminalCreate,
  TerminalOutput,
  TerminalRelease,
  TerminalWaitForExit,
  TerminalKill,
  ElicitationCreate,
) {}

/** Agent → Client notifications. */
export class ClientNotificationRpcs extends RpcGroup.make(SessionUpdateNotification, ElicitationComplete) {}

/** Bidirectional protocol notifications. */
export class ProtocolNotificationRpcs extends RpcGroup.make(CancelRequest) {}

export class AgentRpcs extends AgentRequestRpcs.merge(AgentNotificationRpcs) {}
export class ClientRpcs extends ClientRequestRpcs.merge(ClientNotificationRpcs) {}

/** Unstable Client→Agent model switch; not part of stable AgentRpcs allowlist. */
export class UnstableSessionSetModelRpcs extends RpcGroup.make(SessionSetModel) {}

/** Unstable Client→Agent session fork; not part of stable AgentRpcs allowlist. */
export class UnstableSessionForkRpcs extends RpcGroup.make(SessionFork) {}

/** AIR `_session/archive`; not part of stable AgentRpcs allowlist. */
export class UnstableSessionArchiveRpcs extends RpcGroup.make(SessionArchive) {}

/** AIR `_session/rename`; not part of stable AgentRpcs allowlist. */
export class UnstableSessionRenameRpcs extends RpcGroup.make(SessionRename) {}

/** Claude/Codex `_session/steering`; not part of stable AgentRpcs allowlist. */
export class UnstableSessionSteeringRpcs extends RpcGroup.make(SessionSteering) {}

// =============================================================================
// Intermediate encoded aliases
// =============================================================================

export type AgentRequestEncoded = RequestEncoded<typeof AgentRequestRpcs>;
export type AgentNotificationEncoded = NotificationEncoded<typeof AgentNotificationRpcs>;
export type AgentSuccessEncoded = SuccessEncoded<typeof AgentRequestRpcs>;
export type AgentFailureEncoded = FailureEncoded<typeof AgentRequestRpcs>;

export type ClientRequestEncoded = RequestEncoded<typeof ClientRequestRpcs>;
export type ClientNotificationEncoded = NotificationEncoded<typeof ClientNotificationRpcs>;
export type ClientSuccessEncoded = SuccessEncoded<typeof ClientRequestRpcs>;
export type ClientFailureEncoded = FailureEncoded<typeof ClientRequestRpcs>;

export type ProtocolNotificationEncoded = NotificationEncoded<typeof ProtocolNotificationRpcs>;

/**
 * Bytes the Client writes / Agent reads.
 */
export type TowardAgentEncoded =
  | AgentNotificationEncoded
  | AgentRequestEncoded
  | ClientFailureEncoded
  | ClientSuccessEncoded
  | ProtocolNotificationEncoded;

/**
 * Bytes the Agent writes / Client reads.
 */
export type TowardClientEncoded =
  | AgentFailureEncoded
  | AgentSuccessEncoded
  | ClientNotificationEncoded
  | ClientRequestEncoded
  | ProtocolNotificationEncoded;
