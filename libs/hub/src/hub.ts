/**
 * The MCP hub: a thin router. Agents call tools on `/mcp` with a per-session bearer token; the hub forwards each call
 * to the Harness client that registered that token (`/clients` WebSocket) and returns the client's reply. It holds no
 * session state beyond token → owning client, so everything in it can be rebuilt from the clients.
 */
import { NodeHttpServer } from '@effect/platform-node';
import type { Duration, Scope } from 'effect';
import { Context, Deferred, Effect, Fiber, Layer, Option, Ref, Schema } from 'effect';
import { McpProtocol, McpServer } from 'effect/ai';
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { Socket } from 'effect/socket';
import { createServer } from 'node:http';

import { ClientKind, ClientMessage, HUB_APP_ID, HUB_HOST, PROTOCOL_VERSION } from './protocol.ts';
import { makeHubState } from './state.ts';
import { forwardingHandlers, HubToolkit } from './tools.ts';

/** The calling session's bearer token, provided per `/mcp` request by the auth middleware. */
class CallerToken extends Context.Service<CallerToken, string>()('@lib/hub/CallerToken') {}

export type HubOptions = {
  /** Grace once no client is connected (also from start), before `awaitIdle` completes. */
  readonly idleGrace: Duration.Input;
  /** `0` binds an ephemeral port (tests). */
  readonly port: number;
  readonly secret: string;
};

export type RunningHub = {
  readonly port: number;
  /** Completes once no client has been connected for `idleGrace` (the process then exits). */
  readonly awaitIdle: Effect.Effect<void>;
};

/** Agents' MCP clients negotiate down to one of these (all Streamable HTTP; no legacy HTTP+SSE). */
const MCP_PROTOCOLS = [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18, McpProtocol.v2025_03_26] as const;

export const startHub = (options: HubOptions): Effect.Effect<RunningHub, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const state = makeHubState();
    const idle = yield* Deferred.make<undefined>();
    const idleTimer = yield* Ref.make<Option.Option<Fiber.Fiber<unknown>>>(Option.none());

    const armIdle = Effect.gen(function* () {
      const fiber = yield* Effect.forkDetach(
        Effect.sleep(options.idleGrace).pipe(Effect.andThen(Deferred.succeed(idle, undefined))),
      );
      yield* Ref.set(idleTimer, Option.some(fiber));
    });
    const disarmIdle = Effect.gen(function* () {
      const timer = yield* Ref.getAndSet(idleTimer, Option.none());
      if (Option.isSome(timer)) {
        yield* Fiber.interrupt(timer.value);
      }
    });
    yield* armIdle; // nobody has connected yet: don't linger if the starter never shows up

    const ToolHandlers = HubToolkit.toLayer(
      forwardingHandlers((tool, args) =>
        // The handler runs on the request's fiber, so the auth middleware's service is still in the fiber context
        // even though `McpServer` strips request services from the context captured at registration.
        Effect.withFiber(fiber => {
          const token = Context.getOrUndefined(fiber.context, CallerToken);
          return token === undefined
            ? Effect.succeed({ isError: true, text: 'Missing session credential.' })
            : state.route(token, tool, args);
        }),
      ),
    );

    // Bearer auth for `/mcp`: the token must be registered; provides it to the tool handlers.
    const BearerAuth = HttpRouter.middleware<{ provides: CallerToken }>()(httpEffect =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const header = request.headers['authorization'];
        const token = header?.startsWith('Bearer ') === true ? header.slice('Bearer '.length) : undefined;
        if (token === undefined || !state.isRegistered(token)) {
          return HttpServerResponse.text('Unauthorized', { status: 401 });
        }
        return yield* Effect.provideService(httpEffect, CallerToken, token);
      }),
    );

    const onClientMessage = (
      clientId: number,
      send: (message: object) => Effect.Effect<void>,
      message: ClientMessage,
    ) => {
      switch (message.type) {
        case 'register': {
          return send({ accepted: state.register(clientId, message.token), token: message.token, type: 'registered' });
        }
        case 'bind': {
          return Effect.sync(() => state.bind(clientId, message.token, message.launchTarget, message.sessionId));
        }
        case 'revoke': {
          return Effect.sync(() => state.revoke(clientId, message.token));
        }
        case 'toolResult': {
          return state.resolve(clientId, message.requestId, { isError: message.isError, text: message.text });
        }
      }
    };

    const decodeClientMessage = Schema.decodeUnknownEffect(Schema.fromJsonString(ClientMessage));
    const decodeClientKind = Schema.decodeUnknownOption(ClientKind);

    const clientsRoute = HttpRouter.add(
      'GET',
      '/clients',
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const query = new URL(request.url, 'http://hub.local').searchParams;
        if (query.get('secret') !== options.secret) {
          return HttpServerResponse.text('Bad secret', { status: 401 });
        }
        if (query.get('protocolVersion') !== String(PROTOCOL_VERSION)) {
          return HttpServerResponse.text('Protocol version mismatch', { status: 426 });
        }
        const kind = decodeClientKind(query.get('clientKind'));
        if (Option.isNone(kind)) {
          return HttpServerResponse.text('Unknown client kind', { status: 400 });
        }
        const socket = yield* request.upgrade;
        const write = yield* socket.writer;
        const send = (message: object) => write.write(JSON.stringify(message)).pipe(Effect.ignore);
        const clientId = state.addClient({
          close: write.write(new Socket.CloseEvent(1001, 'hub shutting down')).pipe(Effect.ignore),
          kind: kind.value,
          send,
        });
        yield* disarmIdle;
        yield* Effect.gen(function* () {
          const pull = yield* Socket.readerString(socket);
          while (true) {
            for (const frame of yield* pull) {
              const decoded = yield* decodeClientMessage(frame).pipe(Effect.option);
              if (Option.isSome(decoded)) {
                yield* onClientMessage(clientId, send, decoded.value);
              }
            }
          }
        }).pipe(
          Effect.scoped,
          Effect.ignore,
          Effect.ensuring(
            Effect.gen(function* () {
              yield* state.removeClient(clientId);
              if (state.clientCount() === 0) {
                yield* armIdle;
              }
            }),
          ),
        );
        return HttpServerResponse.empty();
      }),
    );

    // Clients in a WebView probe this cross-origin before connecting; it only says what is listening.
    const healthRoute = HttpRouter.add(
      'GET',
      '/health',
      HttpServerResponse.jsonUnsafe(
        { app: HUB_APP_ID, pid: process.pid, protocolVersion: PROTOCOL_VERSION },
        { headers: { 'access-control-allow-origin': '*' } },
      ),
    );

    // `allowedOrigins` left undefined: `layerHttp` refuses any request carrying an `Origin` header (DNS rebinding).
    const mcpLayer = McpServer.layerHttp({
      name: 'HOA Hub',
      path: '/mcp',
      protocols: MCP_PROTOCOLS,
      version: '0.1.0',
    }).pipe(
      Layer.provide(McpServer.toolkit(HubToolkit).pipe(Layer.provide(ToolHandlers))),
      Layer.provide(BearerAuth.layer),
    );

    const app = Layer.mergeAll(mcpLayer, clientsRoute, healthRoute);
    const serverLayer = NodeHttpServer.layer(createServer, {
      gracefulShutdownTimeout: '3 seconds',
      host: HUB_HOST,
      port: options.port,
    });
    const context = yield* Layer.build(HttpRouter.serve(app).pipe(Layer.provideMerge(serverLayer)));
    // Added after the server, so it runs before the server's own shutdown (finalizers run in reverse).
    yield* Effect.addFinalizer(() => state.closeAll);
    const { address } = Context.get(context, HttpServer.HttpServer);
    const port = 'port' in address ? address.port : options.port;
    return { awaitIdle: Deferred.await(idle), port } satisfies RunningHub;
  });
