/**
 * The hub's whole state: connected clients, credentials (token → owning client, pending or bound to a session) and tool
 * calls in flight. Nothing here outlives the process or needs persisting: clients re-register what they own after a
 * hub restart.
 */
import { Deferred, Effect, Option } from 'effect';

import type { ClientKind } from './protocol.ts';
import { APP_SESSION_ID, HUB_CLIENT_KIND, sessionAttributes } from './telemetryKeys.ts';

export type CallResult = { readonly isError: boolean; readonly text: string };

type Client = {
  /** The owning app instance's id (validated at the handshake); safe to put on telemetry. */
  readonly appSessionId: string;
  /** Close the socket (hub shutting down): clients reconnect, possibly starting a new hub. */
  readonly close: Effect.Effect<void>;
  readonly kind: ClientKind;
  readonly send: (message: object) => Effect.Effect<void>;
};

type Credential = {
  readonly clientId: number;
  /** Undefined while pending: `session/new` has no id until it responds. */
  binding: { readonly launchTarget: string; readonly parentSessionId?: string; readonly sessionId: string } | undefined;
};

type InFlight = { readonly clientId: number; readonly reply: Deferred.Deferred<CallResult> };

const toolError = (text: string): CallResult => ({ isError: true, text });

export const makeHubState = () => {
  let nextClientId = 0;
  const clients = new Map<number, Client>();
  const credentials = new Map<string, Credential>();
  const inFlight = new Map<string, InFlight>();

  return {
    addClient: (client: Client): number => {
      nextClientId += 1;
      clients.set(nextClientId, client);
      return nextClientId;
    },

    /** Close every client socket; upgraded sockets otherwise keep the HTTP server from closing. */
    closeAll: Effect.suspend(() => Effect.forEach([...clients.values()], client => client.close, { discard: true })),

    /** Drop a client: its credentials stop working and its in-flight calls fail now rather than hang. */
    removeClient: (clientId: number): Effect.Effect<void> =>
      Effect.gen(function* () {
        clients.delete(clientId);
        for (const [token, credential] of credentials) {
          if (credential.clientId === clientId) {
            credentials.delete(token);
          }
        }
        for (const [requestId, call] of inFlight) {
          if (call.clientId === clientId) {
            inFlight.delete(requestId);
            yield* Deferred.succeed(
              call.reply,
              toolError('The Harness client that owns this session disconnected before answering.'),
            );
          }
        }
      }),

    clientCount: (): number => clients.size,

    /** False when another client already owns `token` (tokens are never shared or taken over). */
    register: (clientId: number, token: string): boolean => {
      const owner = credentials.get(token)?.clientId;
      if (owner !== undefined && owner !== clientId) {
        return false;
      }
      credentials.set(token, { binding: undefined, clientId });
      return true;
    },

    bind: (
      clientId: number,
      token: string,
      launchTarget: string,
      sessionId: string,
      parentSessionId?: string,
    ): void => {
      const credential = credentials.get(token);
      if (credential?.clientId === clientId) {
        credential.binding = { launchTarget, sessionId, ...(parentSessionId === undefined ? {} : { parentSessionId }) };
      }
    },

    revoke: (clientId: number, token: string): void => {
      if (credentials.get(token)?.clientId === clientId) {
        credentials.delete(token);
      }
    },

    isRegistered: (token: string): boolean => credentials.has(token),

    /**
     * The allowlisted attributes naming who is calling (ids and discriminators only, root ADR 0002): the owning app
     * session and client kind, and the bound ACP session, its launch target and parent. Empty for an unknown token.
     */
    describe: (token: string): Record<string, string> => {
      const credential = credentials.get(token);
      const client = credential === undefined ? undefined : clients.get(credential.clientId);
      return {
        ...(client === undefined ? {} : { [APP_SESSION_ID]: client.appSessionId, [HUB_CLIENT_KIND]: client.kind }),
        ...(credential?.binding === undefined
          ? {}
          : sessionAttributes(
              credential.binding.launchTarget,
              credential.binding.sessionId,
              credential.binding.parentSessionId,
            )),
      };
    },

    /**
     * Forward one tool call to the client owning `token` and wait for its answer. Runs inside the call's `hub.toolCall`
     * span, whose trace context goes to the client with the call.
     */
    route: (token: string, tool: string, args: unknown): Effect.Effect<CallResult> =>
      Effect.gen(function* () {
        const credential = credentials.get(token);
        const client = credential === undefined ? undefined : clients.get(credential.clientId);
        if (credential === undefined || client === undefined) {
          return toolError('The Harness client that owns this session is no longer connected.');
        }
        const requestId = crypto.randomUUID();
        const reply = yield* Deferred.make<CallResult>();
        inFlight.set(requestId, { clientId: credential.clientId, reply });
        const span = yield* Effect.option(Effect.currentSpan);
        const trace = Option.match(span, {
          onNone: () => ({}),
          onSome: current => ({
            trace: { sampled: current.sampled, spanId: current.spanId, traceId: current.traceId },
          }),
        });
        yield* client.send({ args, requestId, token, tool, type: 'toolCall', ...trace });
        // Also cleans up when the agent abandons the request (interrupt).
        return yield* Deferred.await(reply).pipe(Effect.ensuring(Effect.sync(() => inFlight.delete(requestId))));
      }),

    /** A client's answer; ignored unless that client was asked. */
    resolve: (clientId: number, requestId: string, result: CallResult): Effect.Effect<void> =>
      Effect.suspend(() => {
        const call = inFlight.get(requestId);
        return call?.clientId === clientId ? Deferred.succeed(call.reply, result) : Effect.void;
      }),
  };
};

export type HubState = ReturnType<typeof makeHubState>;
