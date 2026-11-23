/**
 * The hub as session RPCs and tool handlers see it: the live connection (or none) and why it is unavailable. Module
 * state, like `sessionRpc.ts`'s Backend connections: the real transport (`hubClient.ts`) and test fakes both go
 * through {@link installHub} / {@link setHubAvailability}, so the rest of the Harness never knows which it has.
 */
import { Effect } from 'effect';
import type { Duration, Scope } from 'effect';

/** What a live hub connection offers the Harness. */
export interface HubConnection {
  readonly mcpUrl: string;
  /** Resolves `true` once the hub can route `token`, `false` if it refused or never confirmed. */
  readonly register: (token: string) => Effect.Effect<boolean>;
  /** `parentSessionId`: set when the session is a Spawned subagent session (hub spans then link it to its parent). */
  readonly bind: (
    token: string,
    launchTarget: string,
    sessionId: string,
    parentSessionId?: string,
  ) => Effect.Effect<void>;
  readonly revoke: (token: string) => Effect.Effect<void>;
}

/**
 * - `connecting`: probing, starting or connecting; session RPCs wait briefly for it to settle.
 * - `available`: connected; sessions get the hub as an MCP server.
 * - `unavailable`: degraded mode, with the reason the UI shows. No MCP server is injected.
 */
export type HubAvailability =
  | { readonly _tag: 'available' }
  | { readonly _tag: 'connecting' }
  | { readonly _tag: 'unavailable'; readonly reason: string };

let current: HubConnection | undefined;
let availability: HubAvailability = { _tag: 'unavailable', reason: 'The hub client has not started.' };
const listeners = new Set<(next: HubAvailability) => void>();

/** The live hub connection, or undefined while unavailable. */
export const currentHub = (): HubConnection | undefined => current;

/** Make `hub` the current connection until the current Scope closes. */
export const installHub = (hub: HubConnection): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      current = hub;
    }),
    () =>
      Effect.sync(() => {
        if (current === hub) {
          current = undefined;
        }
      }),
  );

export const hubAvailability = (): HubAvailability => availability;

export const setHubAvailability = (next: HubAvailability): void => {
  availability = next;
  for (const listener of listeners) {
    listener(next);
  }
};

/** Subscribe to availability changes; returns the unsubscribe. */
export const onHubAvailability = (listener: (next: HubAvailability) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The connection, unless `unavailable`: turning the setting off wins over a connection still closing. */
const settledHub = (): HubConnection | undefined => (availability._tag === 'unavailable' ? undefined : current);

/** Waits until availability leaves `connecting`, for at most `timeout`; returns at once when it is not `connecting`. */
export const awaitHubSettled = (timeout: Duration.Input): Effect.Effect<void> =>
  Effect.suspend(() =>
    availability._tag === 'connecting'
      ? Effect.callback<undefined>(resume => {
          const unsubscribe = onHubAvailability(next => {
            if (next._tag !== 'connecting') {
              resume(Effect.succeed(undefined));
            }
          });
          return Effect.sync(unsubscribe);
        }).pipe(Effect.timeoutOption(timeout), Effect.asVoid)
      : Effect.void,
  );

/**
 * The connection once availability has settled, waiting at most `timeout` while it is `connecting` (e.g. the
 * Virtual session's eager `session/new` racing the hub client's first connect at startup).
 */
export const awaitHub = (timeout: Duration.Input): Effect.Effect<HubConnection | undefined> =>
  awaitHubSettled(timeout).pipe(Effect.map(settledHub));
