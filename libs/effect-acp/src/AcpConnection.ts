import type { Layer } from 'effect';
import { Effect, Queue } from 'effect';
import type { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { RpcClient, RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import { RpcClientDefect, RpcClientError as RpcClientErrorValue } from 'effect/unstable/rpc/RpcClientError';
import type { FromClientEncoded, FromServerEncoded, RequestEncoded } from 'effect/unstable/rpc/RpcMessage';

import { AgentRpcs, ClientRpcs } from './AcpSchema.ts';
import { makeParentStdioTransport, makeStdioTransport } from './AcpTransport.ts';
import type { TransportError } from './AcpTransport.ts';

export type DemuxTargets = {
  readonly toClient: (message: FromServerEncoded) => void;
  readonly toServer: (message: FromClientEncoded) => void;
};

/**
 * Pure demux router for decoded NDJSON-RPC frames on a duplex stdio connection.
 * Clears `pendingClientRequestIds` when an `Exit` for that id is forwarded.
 */
export const routeDecodedMessage = (
  message: unknown,
  pendingClientRequestIds: Set<number | string>,
  notificationIds: Set<number | string>,
  targets: DemuxTargets,
): void => {
  if (typeof message !== 'object' || message === null || !('_tag' in message)) {
    return;
  }

  const tagged = message as { _tag: string; requestId?: number | string };

  if (tagged._tag === 'Chunk' || tagged._tag === 'Defect') {
    if (tagged.requestId !== undefined && pendingClientRequestIds.has(tagged.requestId)) {
      targets.toClient(message as FromServerEncoded);
    }
    return;
  }

  if (tagged._tag === 'Exit') {
    if (tagged.requestId !== undefined && pendingClientRequestIds.has(tagged.requestId)) {
      targets.toClient(message as FromServerEncoded);
      pendingClientRequestIds.delete(tagged.requestId);
    }
    return;
  }

  if (tagged._tag === 'ClientProtocolError') {
    targets.toClient(message as FromServerEncoded);
    return;
  }

  if (tagged._tag === 'Request') {
    const request = message as RequestEncoded;
    if (request.isNotification) {
      notificationIds.add(request.id);
    }
    targets.toServer(request);
  }
};

export type AcpWireTap = {
  readonly onMessage: (direction: 'in' | 'out', message: unknown) => void;
};

/** Mutable write hooks filled in once RpcClient / RpcServer protocols start. */
type StdioDemuxWrites = {
  clientWriteResponse: ((clientId: number, message: FromServerEncoded) => Effect.Effect<void>) | undefined;
  rpcClientId: number;
  serverWriteRequest: ((clientId: number, message: FromClientEncoded) => Effect.Effect<void>) | undefined;
};

/**
 * Shared Effect demux used by both Client (`connectAcpAgent`) and Agent (`serveAcpAgent`) stdio duplexes.
 */
const makeStdioDemuxRoute =
  (
    pendingClientRequestIds: Set<number | string>,
    notificationIds: Set<number | string>,
    writes: StdioDemuxWrites,
    wireTap?: AcpWireTap,
  ) =>
  (message: unknown): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (typeof message !== 'object' || message === null || !('_tag' in message)) {
        return;
      }

      wireTap?.onMessage('in', message);

      let next: Effect.Effect<void> = Effect.void;
      routeDecodedMessage(message, pendingClientRequestIds, notificationIds, {
        toClient: m => {
          next =
            writes.clientWriteResponse !== undefined ? writes.clientWriteResponse(writes.rpcClientId, m) : Effect.void;
        },
        toServer: m => {
          next = writes.serverWriteRequest !== undefined ? writes.serverWriteRequest(0, m) : Effect.void;
        },
      });
      yield* next;
    });

export type AcpAgentConnection = {
  readonly agent: RpcClient.FromGroup<typeof AgentRpcs, RpcClientError>;
  readonly handle: ChildProcessSpawner.ChildProcessHandle;
  readonly notify: (tag: string, payload: unknown) => Effect.Effect<void, TransportError>;
};

export type AcpClientConnection = RpcClient.FromGroup<typeof ClientRpcs, RpcClientError>;

export type AcpAgentServe = {
  readonly client: AcpClientConnection;
  readonly notify: (tag: string, payload: unknown) => Effect.Effect<void, TransportError>;
};

const toRpcClientError = (error: TransportError): RpcClientErrorValue =>
  new RpcClientErrorValue({
    reason: new RpcClientDefect({
      cause: error,
      message: error.message,
    }),
  });

export const connectAcpAgent = Effect.fn('connectAcpAgent')(function* (
  command: ChildProcess.Command,
  clientHandlers: Layer.Layer<Rpc.ToHandler<RpcGroup.Rpcs<typeof ClientRpcs>>>,
  options?: {
    readonly wireTap?: AcpWireTap;
  },
) {
  const wireTap = options?.wireTap;
  const handle = yield* command;

  yield* Effect.addFinalizer(() => handle.kill().pipe(Effect.ignore));

  const pendingClientRequestIds = new Set<number | string>();
  const notificationIds = new Set<number | string>();
  const writes: StdioDemuxWrites = {
    clientWriteResponse: undefined,
    rpcClientId: 0,
    serverWriteRequest: undefined,
  };
  const demuxRoute = makeStdioDemuxRoute(pendingClientRequestIds, notificationIds, writes, wireTap);

  const transport = yield* makeStdioTransport(handle, demuxRoute, wireTap).pipe(
    Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndJsonRpc()),
  );

  const clientProtocol = yield* RpcClient.Protocol.make(
    Effect.fnUntraced(function* (writeResponse) {
      writes.clientWriteResponse = writeResponse;
      yield* Effect.void;

      return {
        codecFor: transport.codecFor,
        send: (clientId: number, message: FromClientEncoded) => {
          writes.rpcClientId = clientId;
          if (message._tag === 'Request' && message.isNotification !== true) {
            pendingClientRequestIds.add(message.id);
          }
          return transport.send(message).pipe(Effect.mapError(toRpcClientError));
        },
        supportsAck: false,
        supportsTransferables: false,
      };
    }),
  );

  const serverProtocol = yield* RpcServer.Protocol.make(
    Effect.fnUntraced(function* (writeRequest) {
      writes.serverWriteRequest = writeRequest;

      return {
        clientIds: Effect.succeed(new Set([0])),
        codecFor: transport.codecFor,
        disconnects: yield* Queue.make<number>(),
        end: () => Effect.void,
        initialMessage: Effect.succeedNone,
        send: (_clientId: number, response: FromServerEncoded) => {
          if ('requestId' in response && notificationIds.has(response.requestId)) {
            return Effect.void;
          }
          return transport.send(response).pipe(Effect.orDie);
        },
        supportsAck: false,
        supportsNotifications: true,
        supportsSpanPropagation: false,
        supportsTransferables: false,
      };
    }),
  );

  yield* Effect.forkScoped(
    RpcServer.make(ClientRpcs).pipe(
      Effect.provideService(RpcServer.Protocol, serverProtocol),
      Effect.provide(clientHandlers),
    ),
  );

  const agent = yield* RpcClient.make(AgentRpcs).pipe(Effect.provideService(RpcClient.Protocol, clientProtocol));

  yield* transport.start;

  return {
    agent,
    handle,
    notify: transport.notify,
  } as const satisfies AcpAgentConnection;
});

/**
 * Agent-process entry: serve `AgentRpcs` on stdin and call `ClientRpcs` on stdout.
 * `makeHandlers` receives the Client RpcClient so handlers can await `elicitation/create`, etc.
 */
export const serveAcpAgent = Effect.fn('serveAcpAgent')(function* (
  makeHandlers: (
    client: AcpClientConnection,
    notify: (tag: string, payload: unknown) => Effect.Effect<void, TransportError>,
  ) => Layer.Layer<Rpc.ToHandler<RpcGroup.Rpcs<typeof AgentRpcs>>>,
  options?: {
    readonly wireTap?: AcpWireTap;
  },
) {
  const wireTap = options?.wireTap;

  const pendingClientRequestIds = new Set<number | string>();
  const notificationIds = new Set<number | string>();
  const writes: StdioDemuxWrites = {
    clientWriteResponse: undefined,
    rpcClientId: 0,
    serverWriteRequest: undefined,
  };
  const demuxRoute = makeStdioDemuxRoute(pendingClientRequestIds, notificationIds, writes, wireTap);

  const transport = yield* makeParentStdioTransport(demuxRoute, wireTap).pipe(
    Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndJsonRpc()),
  );

  const clientProtocol = yield* RpcClient.Protocol.make(
    Effect.fnUntraced(function* (writeResponse) {
      writes.clientWriteResponse = writeResponse;
      yield* Effect.void;

      return {
        codecFor: transport.codecFor,
        send: (clientId: number, message: FromClientEncoded) => {
          writes.rpcClientId = clientId;
          if (message._tag === 'Request' && message.isNotification !== true) {
            pendingClientRequestIds.add(message.id);
          }
          return transport.send(message).pipe(Effect.mapError(toRpcClientError));
        },
        supportsAck: false,
        supportsTransferables: false,
      };
    }),
  );

  const serverProtocol = yield* RpcServer.Protocol.make(
    Effect.fnUntraced(function* (writeRequest) {
      writes.serverWriteRequest = writeRequest;

      return {
        clientIds: Effect.succeed(new Set([0])),
        codecFor: transport.codecFor,
        disconnects: yield* Queue.make<number>(),
        end: () => Effect.void,
        initialMessage: Effect.succeedNone,
        send: (_clientId: number, response: FromServerEncoded) => {
          if ('requestId' in response && notificationIds.has(response.requestId)) {
            return Effect.void;
          }
          return transport.send(response).pipe(Effect.orDie);
        },
        supportsAck: false,
        supportsNotifications: true,
        supportsSpanPropagation: false,
        supportsTransferables: false,
      };
    }),
  );

  const client = yield* RpcClient.make(ClientRpcs).pipe(Effect.provideService(RpcClient.Protocol, clientProtocol));

  yield* Effect.forkScoped(
    RpcServer.make(AgentRpcs).pipe(
      Effect.provideService(RpcServer.Protocol, serverProtocol),
      Effect.provide(makeHandlers(client, transport.notify)),
    ),
  );

  yield* transport.start;

  return {
    client,
    notify: transport.notify,
  } as const satisfies AcpAgentServe;
});
