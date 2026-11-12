/**
 * Hub client: this Harness's connection to the machine-wide MCP hub (`@lib/hub`). Ensures a hub is running (probing
 * `/health`, starting one through the launcher when none answers), connects `/clients`, installs the connection for
 * session RPCs, and serves the tool calls the hub routes here. Reconnects (and restarts the hub) when the socket drops,
 * re-registering every credential it owns, so a hub crash only fails the calls in flight.
 */
import { resolveHome } from '@lib/hoa-home';
import {
  clientsQuery,
  Discovery,
  DISCOVERY_FILENAME,
  HealthPayload,
  HUB_HOST,
  HubMessage,
  PROTOCOL_VERSION,
} from '@lib/hub/protocol';
import type { ClientKind, ClientMessage } from '@lib/hub/protocol';
import type { OS } from '@lib/context-services';
import { Deferred, Duration, Effect, Schedule, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import { Socket } from 'effect/socket';

import { installHub, setHubAvailability } from './hubConnection.ts';
import type { HubConnection } from './hubConnection.ts';
import { handleHubToolCall, registeredTokens } from './hubSessions.ts';
import { recordHubWire } from './hubWireLog.ts';

/** Why the hub cannot be used; `reason` is what the degraded-mode notice shows. */
export class HubUnavailable extends Schema.TaggedError<HubUnavailable>()('HubUnavailable', {
  reason: Schema.String,
}) {}

/** An established connection dropped (hub exited or crashed): reconnect at once. */
class HubConnectionLost extends Schema.TaggedError<HubConnectionLost>()('HubConnectionLost', {}) {}

export type HubClientOptions<R> = {
  readonly clientKind: ClientKind;
  readonly port: number;
  /** Start a hub when none answers (the launcher); fails with why it cannot (Node missing, bundle missing…). */
  readonly startHub: Effect.Effect<void, HubUnavailable, R>;
};

/** How long a started hub gets to answer `/health` and publish its discovery file. */
const START_TIMEOUT = Duration.seconds(8);
/** How long a session RPC waits for the hub to confirm a new credential. */
const REGISTER_TIMEOUT = Duration.seconds(2);

type Probe =
  | { readonly _tag: 'absent' }
  | { readonly _tag: 'foreign' }
  | { readonly _tag: 'hub'; readonly pid: number; readonly version: number };

const decodeHealth = Schema.decodeUnknownOption(HealthPayload);

/** What answers on the hub port: nothing, something else, or a hub (and which protocol it speaks). */
const probe = (port: number): Effect.Effect<Probe> =>
  Effect.tryPromise(() => fetch(`http://${HUB_HOST}:${port}/health`, { signal: AbortSignal.timeout(1500) })).pipe(
    Effect.matchEffect({
      // Nothing accepted the connection.
      onFailure: () => Effect.succeed<Probe>({ _tag: 'absent' }),
      // Something answered; only a hub's identity payload makes it ours.
      onSuccess: response =>
        Effect.tryPromise(() => response.json() as Promise<unknown>).pipe(
          Effect.map((body): Probe => {
            const health = decodeHealth(body);
            return response.ok && health._tag === 'Some'
              ? { _tag: 'hub', pid: health.value.pid, version: health.value.protocolVersion }
              : { _tag: 'foreign' };
          }),
          Effect.orElseSucceed((): Probe => ({ _tag: 'foreign' })),
        ),
    }),
  );

const readDiscovery = Effect.gen(function* () {
  const fs = yield* FileSystem;
  const path = yield* Path;
  const raw = yield* fs.readFileString(path.join(yield* resolveHome(), DISCOVERY_FILENAME));
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Discovery))(raw);
});

/** A hub answering on `port` with a matching protocol, and its discovery record; starts one if none answers. */
const ensureHub = <R>(options: HubClientOptions<R>) =>
  Effect.gen(function* () {
    let found = yield* probe(options.port);
    if (found._tag === 'absent') {
      yield* Effect.logInfo('No hub answering; starting one', options.port);
      yield* options.startHub;
      // Wait until it binds and publishes the discovery file (the bind happens first).
      found = yield* probe(options.port).pipe(
        Effect.repeat({ schedule: Schedule.spaced('200 millis'), until: next => next._tag !== 'absent' }),
        Effect.timeoutOption(START_TIMEOUT),
        Effect.map(next => (next._tag === 'Some' ? next.value : found)),
      );
    }
    switch (found._tag) {
      case 'absent': {
        return yield* new HubUnavailable({ reason: 'The HOA hub did not start. Its log is at ~/.hoa/logs/hub.log.' });
      }
      case 'foreign': {
        return yield* new HubUnavailable({
          reason: `Another program is using port ${options.port}, which the HOA hub needs. Quit that program, or set "hubPort" in ~/.hoa/settings.json to a free port and reopen every HOA window.`,
        });
      }
      case 'hub': {
        // No takeover: a mismatched hub exits by itself once its own clients are gone, and the reconnect loop then
        // starts one this version speaks (ADR 0002).
        if (found.version < PROTOCOL_VERSION) {
          return yield* new HubUnavailable({
            reason: `An older HOA window is running the HOA hub (protocol ${found.version}; this window needs ${PROTOCOL_VERSION}). Close the older HOA windows; this one reconnects by itself.`,
          });
        }
        if (found.version > PROTOCOL_VERSION) {
          return yield* new HubUnavailable({
            reason: `A newer HOA window is running the HOA hub (protocol ${found.version}; this window speaks ${PROTOCOL_VERSION}). Update this app, or close the newer windows.`,
          });
        }
      }
    }
    // The hub binds before it writes its discovery file, and a crashed hub leaves its file behind: wait for this
    // hub's own file rather than connect with a dead hub's secret.
    const { pid } = found;
    return yield* readDiscovery.pipe(
      Effect.filterOrFail(
        discovery => discovery.pid === pid && discovery.port === options.port,
        () => new HubUnavailable({ reason: 'The HOA hub did not publish its connection details. Retrying.' }),
      ),
      Effect.retry({ schedule: Schedule.spaced('200 millis'), times: 25 }),
      Effect.mapError(error =>
        error._tag === 'HubUnavailable'
          ? error
          : new HubUnavailable({
              reason: 'Could not read the HOA hub connection details (~/.hoa/hub.json). Retrying.',
            }),
      ),
    );
  });

/** One connection: connect, install, serve until the socket drops (always ends in `HubUnavailable`). */
const connectOnce = <R>(options: HubClientOptions<R>) =>
  Effect.gen(function* () {
    const discovery = yield* ensureHub(options);
    const url = `ws://${HUB_HOST}:${options.port}/clients?${clientsQuery({ clientKind: options.clientKind, secret: discovery.secret })}`;
    const socket = yield* Socket.makeWebSocket(url).pipe(Effect.provide(Socket.layerWebSocketConstructorGlobal));
    // The reader dials and waits for open; the writer is only usable after that.
    const pull = yield* Socket.readerString(socket).pipe(
      Effect.mapError(() => new HubUnavailable({ reason: 'Could not connect to the HOA hub. Retrying.' })),
    );
    const writer = yield* socket.writer;
    const send = (message: ClientMessage) =>
      Effect.andThen(
        Effect.sync(() => recordHubWire('sent', message)),
        writer.write(JSON.stringify(message)).pipe(Effect.ignore),
      );

    /** token → the hub's answer to its `register`. */
    const answers = new Map<string, Deferred.Deferred<boolean>>();
    const hub: HubConnection = {
      bind: (token, launchTarget, sessionId) => send({ launchTarget, sessionId, token, type: 'bind' }),
      mcpUrl: `http://${HUB_HOST}:${options.port}/mcp`,
      register: token =>
        Effect.gen(function* () {
          const answer = Deferred.makeUnsafe<boolean>();
          answers.set(token, answer);
          yield* send({ token, type: 'register' });
          return yield* Deferred.await(answer).pipe(
            Effect.timeoutOption(REGISTER_TIMEOUT),
            Effect.map(result => result._tag === 'Some' && result.value),
            Effect.ensuring(Effect.sync(() => answers.delete(token))),
          );
        }),
      revoke: token => send({ token, type: 'revoke' }),
    };

    // A hub restart is invisible to sessions: re-register every credential this Harness still owns. Frames are
    // ordered, so these land before any registration a session RPC makes once the connection is installed.
    for (const { launchTarget, sessionId, token } of registeredTokens()) {
      yield* send({ token, type: 'register' });
      if (sessionId !== undefined) {
        yield* hub.bind(token, launchTarget, sessionId);
      }
    }
    yield* installHub(hub);
    setHubAvailability({ _tag: 'available' });
    yield* Effect.logInfo('Hub client connected', { clientKind: options.clientKind, port: options.port });

    const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(HubMessage));
    const dispatch = (message: HubMessage) =>
      message.type === 'registered'
        ? Effect.sync(() => {
            const answer = answers.get(message.token);
            if (answer !== undefined) {
              Deferred.doneUnsafe(answer, Effect.succeed(message.accepted));
            }
          })
        : handleHubToolCall(message).pipe(
            Effect.flatMap(result =>
              send({ isError: result.isError, requestId: message.requestId, text: result.text, type: 'toolResult' }),
            ),
            Effect.forkScoped,
          );
    while (true) {
      const frames = yield* pull.pipe(Effect.mapError(() => new HubConnectionLost()));
      for (const frame of frames) {
        const incoming = yield* decode(frame).pipe(Effect.option);
        if (incoming._tag === 'Some') {
          recordHubWire('received', incoming.value);
          yield* dispatch(incoming.value);
        }
      }
    }
  }).pipe(Effect.scoped);

/**
 * Keep this Harness connected to the hub for the Scope's lifetime, publishing availability through
 * `setHubAvailability`. A dropped connection reconnects at once (starting a new hub if the old one died); repeated
 * failures back off, and the degraded-mode notice clears by itself once the hub becomes reachable.
 */
export const runHubClient = <R>(
  options: HubClientOptions<R>,
): Effect.Effect<never, never, R | FileSystem | OS | Path> =>
  Effect.gen(function* () {
    setHubAvailability({ _tag: 'connecting' });
    let failures = 0;
    while (true) {
      const error = yield* Effect.flip(connectOnce(options));
      if (error._tag === 'HubConnectionLost') {
        failures = 0;
        yield* Effect.logWarning('Hub connection lost; reconnecting');
        setHubAvailability({ _tag: 'connecting' });
      } else {
        failures += 1;
        yield* Effect.logWarning('Hub unavailable', error.reason);
        setHubAvailability({ _tag: 'unavailable', reason: error.reason });
        yield* Effect.sleep(Duration.min(Duration.seconds(2 ** (failures - 1)), Duration.seconds(30)));
      }
    }
  });
