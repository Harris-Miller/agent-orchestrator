/** The Harness's connection to the machine-wide MCP hub, and the hub state the UI gates MCP-backed actions on. */
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { runHubClient } from '../host/hubClient.ts';
import { hubAvailability, onHubAvailability, setHubAvailability } from '../host/hubConnection.ts';
import type { HubAvailability } from '../host/hubConnection.ts';
import { hostHubClientOptions } from '../host/hubLauncher.ts';
import { onSessionHubStatuses, sessionHubStatuses } from '../host/hubSessions.ts';
import type { SessionHubStatus } from '../host/hubSessions.ts';

export const hubAvailabilityAtom = Atom.make((get): HubAvailability => {
  get.addFinalizer(onHubAvailability(next => get.setSelf(next)));
  return hubAvailability();
}).pipe(Atom.keepAlive);

export const sessionHubStatusesAtom = Atom.make((get): ReadonlyMap<string, SessionHubStatus> => {
  get.addFinalizer(onSessionHubStatuses(next => get.setSelf(next)));
  return sessionHubStatuses();
}).pipe(Atom.keepAlive);

export const createHubAtoms = (runtime: HostRuntimeBag['atomRuntime']) => ({
  /** Mount for the app's lifetime (`HubMount`): ensures a hub, connects, reconnects; degraded when it cannot. */
  hubAtom: runtime.atom(
    hostHubClientOptions.pipe(
      Effect.flatMap(runHubClient),
      Effect.catchTag('HubUnavailable', error =>
        Effect.sync(() => {
          setHubAvailability({ _tag: 'unavailable', reason: error.reason });
        }),
      ),
    ),
  ),
});
