import type { Layer } from 'effect';
import { Context, Effect, Option, Queue, Schema, Tracer } from 'effect';
import type { ChildProcess, ChildProcessSpawner } from 'effect/process';
import type { Rpc, RpcGroup } from 'effect/rpc';
import { RpcClient, RpcSerialization, RpcServer } from 'effect/rpc';
import type { RpcClientError } from 'effect/rpc/RpcClientError';
import { RpcClientDefect, RpcClientError as RpcClientErrorValue } from 'effect/rpc/RpcClientError';
import type { FromClientEncoded, FromServerEncoded, RequestEncoded } from 'effect/rpc/RpcMessage';

import {
  AgentRpcs,
  ClientRpcs,
  ServedClientRpcs,
  SESSION_ARCHIVE_METHOD,
  SESSION_FORK_METHOD,
  SESSION_LIST_SUBSCRIBE_METHOD,
  SESSION_LIST_UNSUBSCRIBE_METHOD,
  SESSION_RENAME_METHOD,
  SESSION_SET_MODEL_METHOD,
  SESSION_STEERING_METHOD,
  SESSION_UNARCHIVE_METHOD,
  UnstableSessionArchiveRpcs,
  UnstableSessionForkRpcs,
  UnstableSessionListSubscribeRpcs,
  UnstableSessionRenameRpcs,
  UnstableSessionSetModelRpcs,
  UnstableSessionSteeringRpcs,
} from './AcpSchema.ts';
import { makeParentStdioTransport, makeStdioTransport } from './AcpTransport.ts';
import type { TransportError } from './AcpTransport.ts';
import { AcpError } from './schema/common.ts';

export type DemuxTargets = {
  readonly toClient: (message: FromServerEncoded) => void;
  readonly toServer: (message: FromClientEncoded) => void;
};

const decodeAcpError = Schema.decodeUnknownOption(AcpError);

/** ndJsonRpc maps JSON-RPC errors to Exit Die; rewrite AcpError-shaped Dies to Fail for RpcClient. */
const remapExitAcpErrorDies = (message: FromServerEncoded): FromServerEncoded => {
  if (message._tag !== 'Exit' || message.exit._tag !== 'Failure') {
    return message;
  }

  return {
    ...message,
    exit: {
      _tag: 'Failure',
      cause: message.exit.cause.map(reason => {
        if (reason._tag !== 'Die') {
          return reason;
        }
        const error = Option.getOrUndefined(decodeAcpError(reason.defect));
        if (error === undefined) {
          return reason;
        }
        return { _tag: 'Fail' as const, error };
      }),
    },
  };
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
      targets.toClient(remapExitAcpErrorDies(message as FromServerEncoded));
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
      // ndJsonRpc maps JSON-RPC notifications (no id) to id "". RpcServer keys in-flight
      // handlers by id and returns Effect.interrupt on duplicates — which kills the demux
      // read fiber and wedges the duplex (in-flight session/new never sees its Exit).
      const id = request.id !== '' ? request.id : `acp-notif-${crypto.randomUUID()}`;
      notificationIds.add(id);
      targets.toServer(id === request.id ? request : { ...request, id });
      return;
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
  /** Last sender; fallback for frames without a `requestId`. */
  rpcClientId: number;
  /** Each RpcClient has its own clientId; an Exit/Chunk must return to the client that sent the request. */
  readonly clientIdByRequest: Map<number | string, number>;
  serverWriteRequest: ((clientId: number, message: FromClientEncoded) => Effect.Effect<void>) | undefined;
};

const makeStdioDemuxWrites = (): StdioDemuxWrites => ({
  clientWriteResponse: undefined,
  clientIdByRequest: new Map(),
  rpcClientId: 0,
  serverWriteRequest: undefined,
});

/** Records which RpcClient sent a request so its response routes back to it. */
const trackClientSend = (
  writes: StdioDemuxWrites,
  pendingClientRequestIds: Set<number | string>,
  clientId: number,
  message: FromClientEncoded,
) => {
  writes.rpcClientId = clientId;
  if (message._tag === 'Request' && message.isNotification !== true) {
    pendingClientRequestIds.add(message.id);
    writes.clientIdByRequest.set(message.id, clientId);
  }
};

/**
 * Shared Effect demux used by both Client (`connectAcpAgent`) and Agent (`serveAcpAgent`) stdio duplexes.
 */
export const makeStdioDemuxRoute =
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
          const requestId = 'requestId' in m ? m.requestId : undefined;
          const clientId = requestId === undefined ? undefined : writes.clientIdByRequest.get(requestId);
          if (m._tag === 'Exit' && requestId !== undefined) {
            writes.clientIdByRequest.delete(requestId);
          }
          next =
            writes.clientWriteResponse !== undefined
              ? writes.clientWriteResponse(clientId ?? writes.rpcClientId, m)
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
  /** AIR `_session/archive`. Not part of stable AgentRpcs. */
  readonly sessionArchive: RpcClient.FromGroup<
    typeof UnstableSessionArchiveRpcs,
    RpcClientError
  >[typeof SESSION_ARCHIVE_METHOD];
  /** Unstable `session/fork`. Not part of stable AgentRpcs. */
  readonly sessionFork: RpcClient.FromGroup<typeof UnstableSessionForkRpcs, RpcClientError>[typeof SESSION_FORK_METHOD];
  /** AIR `_session/list/subscribe`. Not part of stable AgentRpcs. */
  readonly sessionListSubscribe: RpcClient.FromGroup<
    typeof UnstableSessionListSubscribeRpcs,
    RpcClientError
  >[typeof SESSION_LIST_SUBSCRIBE_METHOD];
  /** AIR `_session/list/unsubscribe`. Not part of stable AgentRpcs. */
  readonly sessionListUnsubscribe: RpcClient.FromGroup<
    typeof UnstableSessionListSubscribeRpcs,
    RpcClientError
  >[typeof SESSION_LIST_UNSUBSCRIBE_METHOD];
  /** AIR `_session/rename`. Not part of stable AgentRpcs. */
  readonly sessionRename: RpcClient.FromGroup<
    typeof UnstableSessionRenameRpcs,
    RpcClientError
  >[typeof SESSION_RENAME_METHOD];
  /** Claude/Codex `_session/steering`. Not part of stable AgentRpcs. */
  readonly sessionSteering: RpcClient.FromGroup<
    typeof UnstableSessionSteeringRpcs,
    RpcClientError
  >[typeof SESSION_STEERING_METHOD];
  /** AIR `_session/unarchive`. Not part of stable AgentRpcs. */
  readonly sessionUnarchive: RpcClient.FromGroup<
    typeof UnstableSessionArchiveRpcs,
    RpcClientError
  >[typeof SESSION_UNARCHIVE_METHOD];
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
    clientHandlers: Layer.Layer<Rpc.ToHandler<RpcGroup.Rpcs<typeof ServedClientRpcs>>>,
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
    const writes = makeStdioDemuxWrites();
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
            trackClientSend(writes, pendingClientRequestIds, clientId, message);
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
        RpcServer.make(ServedClientRpcs, { disableTracing: true }).pipe(
          Effect.provideService(RpcServer.Protocol, serverProtocol),
          Effect.provide(clientHandlers),
        ),
      ),
    );

    const agent = yield* RpcClient.make(AgentRpcs).pipe(Effect.provideService(RpcClient.Protocol, clientProtocol));
    const archiveClient = yield* RpcClient.make(UnstableSessionArchiveRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, clientProtocol),
    );
    const forkClient = yield* RpcClient.make(UnstableSessionForkRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, clientProtocol),
    );
    const listSubscribeClient = yield* RpcClient.make(UnstableSessionListSubscribeRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, clientProtocol),
    );
    const renameClient = yield* RpcClient.make(UnstableSessionRenameRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, clientProtocol),
    );
    const setModelClient = yield* RpcClient.make(UnstableSessionSetModelRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, clientProtocol),
    );
    const steeringClient = yield* RpcClient.make(UnstableSessionSteeringRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, clientProtocol),
    );

    yield* transport.start;
    yield* Effect.logInfo('ACP agent connection ready', { pid: handle.pid });

    return {
      agent,
      handle,
      notify: transport.notify,
      sessionArchive: archiveClient[SESSION_ARCHIVE_METHOD],
      sessionFork: forkClient[SESSION_FORK_METHOD],
      sessionListSubscribe: listSubscribeClient[SESSION_LIST_SUBSCRIBE_METHOD],
      sessionListUnsubscribe: listSubscribeClient[SESSION_LIST_UNSUBSCRIBE_METHOD],
      sessionRename: renameClient[SESSION_RENAME_METHOD],
      sessionSetModel: setModelClient[SESSION_SET_MODEL_METHOD],
      sessionSteering: steeringClient[SESSION_STEERING_METHOD],
      sessionUnarchive: archiveClient[SESSION_UNARCHIVE_METHOD],
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
    const writes = makeStdioDemuxWrites();
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
            trackClientSend(writes, pendingClientRequestIds, clientId, message);
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
