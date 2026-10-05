import type { Layer } from 'effect';
import { Context, Effect, Queue, Tracer } from 'effect';
import type { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { RpcClient, RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import { RpcClientDefect, RpcClientError as RpcClientErrorValue } from 'effect/unstable/rpc/RpcClientError';
import type { FromClientEncoded, FromServerEncoded, RequestEncoded } from 'effect/unstable/rpc/RpcMessage';

import { AgentRpcs, ClientRpcs, SESSION_SET_MODEL_METHOD, UnstableSessionSetModelRpcs } from './AcpSchema.ts';
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

  if (tagged._tag === 'Chunk') {
    if (tagged.requestId !== undefined && pendingClientRequestIds.has(tagged.requestId)) {
      targets.toClient(message as FromServerEncoded);
    }
    return;
  }

  // Connection-level Defect (RpcServer sendDefect) has no requestId; still fail in-flight client RPCs.
  if (tagged._tag === 'Defect') {
    if (tagged.requestId === undefined || pendingClientRequestIds.has(tagged.requestId)) {
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
        yield* Effect.logDebug('ACP demux dropped untagged message');
        return;
      }

      const tag = (message as { _tag: string })._tag;
      yield* Effect.logDebug('ACP demux inbound', tag);
      wireTap?.onMessage('in', message);

      let next: Effect.Effect<void> = Effect.void;
      routeDecodedMessage(message, pendingClientRequestIds, notificationIds, {
        toClient: m => {
          next =
            writes.clientWriteResponse !== undefined
              ? writes.clientWriteResponse(writes.rpcClientId, m)
              : Effect.logWarning('ACP demux toClient before client protocol ready', tag);
        },
        toServer: m => {
          next =
            writes.serverWriteRequest !== undefined
              ? writes.serverWriteRequest(0, m)
              : Effect.logWarning('ACP demux toServer before server protocol ready', tag);
        },
      });
      yield* next;
    });

export type AcpAgentConnection = {
  readonly agent: RpcClient.FromGroup<typeof AgentRpcs, RpcClientError>;
  readonly handle: ChildProcessSpawner.ChildProcessHandle;
  readonly notify: (tag: string, payload: unknown) => Effect.Effect<void, TransportError>;
  /** Unstable `session/set_model` (Gemini). Not part of stable AgentRpcs. */
  readonly sessionSetModel: RpcClient.FromGroup<
    typeof UnstableSessionSetModelRpcs,
    RpcClientError
  >[typeof SESSION_SET_MODEL_METHOD];
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

/** Drop ParentSpan from fiber context without widening Effect R (Context.omit + updateContext does). */
const withoutParentSpan = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.updateContext((ctx): Context.Context<R> => Context.omit(Tracer.ParentSpan)(ctx) as Context.Context<R>),
  );

export const connectAcpAgent = Effect.fnUntraced(
  function* (
    command: ChildProcess.Command,
    clientHandlers: Layer.Layer<Rpc.ToHandler<RpcGroup.Rpcs<typeof ClientRpcs>>>,
    options?: {
      readonly wireTap?: AcpWireTap;
    },
  ) {
    yield* Effect.logInfo('Connecting ACP agent');
    const wireTap = options?.wireTap;
    const handle = yield* command;
    yield* Effect.logInfo('ACP agent child spawned', { pid: handle.pid });

    yield* Effect.addFinalizer(() =>
      Effect.logInfo('Disconnecting ACP agent', { pid: handle.pid }).pipe(
        Effect.andThen(handle.kill()),
        Effect.tapError(error => Effect.logWarning('ACP agent kill failed', error)),
        Effect.ignore,
      ),
    );

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
        yield* Effect.logDebug('ACP client protocol ready');
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
        yield* Effect.logDebug('ACP server protocol ready');

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
            return transport.send(response).pipe(
              Effect.tapError(error => Effect.logFatal('ACP server send failed', error.message)),
              Effect.orDie,
            );
          },
          supportsAck: false,
          supportsNotifications: true,
          supportsSpanPropagation: false,
          supportsTransferables: false,
        };
      }),
    );

    // Strip ParentSpan so demux/handler fibers do not inherit connect (live or ended).
    yield* Effect.forkScoped(
      withoutParentSpan(
        RpcServer.make(ClientRpcs, { disableTracing: true }).pipe(
          Effect.provideService(RpcServer.Protocol, serverProtocol),
          Effect.provide(clientHandlers),
        ),
      ),
    );

    const agent = yield* RpcClient.make(AgentRpcs).pipe(Effect.provideService(RpcClient.Protocol, clientProtocol));
    const setModelClient = yield* RpcClient.make(UnstableSessionSetModelRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, clientProtocol),
    );

    yield* transport.start;
    yield* Effect.logInfo('ACP agent connection ready', { pid: handle.pid });

    return {
      agent,
      handle,
      notify: transport.notify,
      sessionSetModel: setModelClient[SESSION_SET_MODEL_METHOD],
    } as const satisfies AcpAgentConnection;
  },
  // Short setup span only — lifetime Agent→Client traffic must not parent under connect.
  Effect.withSpan('connectAcpAgent'),
  Effect.annotateLogs({ module: 'AcpConnection', role: 'client' }),
  Effect.tapError(error => Effect.logError('connectAcpAgent failed', error)),
);
/**
 * Agent-process entry: serve `AgentRpcs` on stdin and call `ClientRpcs` on stdout.
 * `makeHandlers` receives the Client RpcClient so handlers can await `elicitation/create`, etc.
 */
export const serveAcpAgent = Effect.fnUntraced(
  function* (
    makeHandlers: (
      client: AcpClientConnection,
      notify: (tag: string, payload: unknown) => Effect.Effect<void, TransportError>,
    ) => Layer.Layer<Rpc.ToHandler<RpcGroup.Rpcs<typeof AgentRpcs>>>,
    options?: {
      readonly wireTap?: AcpWireTap;
    },
  ) {
    yield* Effect.logInfo('Serving ACP agent on parent stdio');
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
        yield* Effect.logDebug('ACP serve client protocol ready');
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
        yield* Effect.logDebug('ACP serve server protocol ready');

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
            return transport.send(response).pipe(
              Effect.tapError(error => Effect.logFatal('ACP serve send failed', error.message)),
              Effect.orDie,
            );
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
    yield* Effect.logInfo('ACP agent serve ready');

    return {
      client,
      notify: transport.notify,
    } as const satisfies AcpAgentServe;
  },
  // Span stays open until serve scope closes so demux forks keep a live ParentSpan.
  Effect.withSpanScoped('serveAcpAgent'),
  Effect.annotateLogs({ module: 'AcpConnection', role: 'agent' }),
  Effect.tapError(error => Effect.logError('serveAcpAgent failed', error)),
);
