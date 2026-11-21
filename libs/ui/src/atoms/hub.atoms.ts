/** The Harness's connection to the machine-wide MCP hub, and the hub state the UI gates MCP-backed actions on. */
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { makeChangeTracker } from '../host/changeTracker.ts';
import { runHubClient } from '../host/hubClient.ts';
import { hubAvailability, onHubAvailability, setHubAvailability } from '../host/hubConnection.ts';
import type { HubAvailability } from '../host/hubConnection.ts';
import { hostHubClientOptions } from '../host/hubLauncher.ts';
import { onSessionHubStatuses, sessionHubStatuses } from '../host/hubSessions.ts';
import type { SessionHubStatus } from '../host/hubSessions.ts';
import { hubWireEntries, onHubWireEntries } from '../host/hubWireLog.ts';
import type { HubWireEntry } from '../host/hubWireLog.ts';

import { appOrchestratedAgentsEnabledAtom, userSettingsLoadedAtom } from './userSettings/userSettingsDocument.atoms.ts';

/** Shown (developer panel, session status) while Experimental: App Orchestrated Agents is off. */
const HUB_DISABLED_REASON = 'Experimental: App Orchestrated Agents is off in Settings.';

export const hubAvailabilityAtom = Atom.make((get): HubAvailability => {
  get.addFinalizer(
    onHubAvailability(next => {
      get.setSelf(next);
    }),
  );
  return hubAvailability();
}).pipe(Atom.keepAlive);

export const sessionHubStatusesAtom = Atom.make((get): ReadonlyMap<string, SessionHubStatus> => {
  get.addFinalizer(
    onSessionHubStatuses(next => {
      get.setSelf(next);
    }),
  );
  return sessionHubStatuses();
}).pipe(Atom.keepAlive);

/** `/clients` frames sent and received (developer panel). */
export const hubWireEntriesAtom = Atom.make((get): readonly HubWireEntry[] => {
  get.addFinalizer(
    onHubWireEntries(next => {
      get.setSelf(next);
    }),
  );
  return hubWireEntries();
}).pipe(Atom.keepAlive);

export const createHubAtoms = (
  runtime: HostRuntimeBag['atomRuntime'],
  reactivateActiveSessionsAtomFn: Atom.Writable<unknown, undefined>,
) => {
  const enabledChange = makeChangeTracker();
  return {
    /**
     * Mount for the app's lifetime (`HubMount`): while Experimental: App Orchestrated Agents is on, ensures a hub,
     * connects, reconnects; degraded when it cannot. Turning the setting off closes the connection. The setting is awaited
     * (as `connecting`) before deciding, so a session RPC at startup does not mistake "not loaded yet" for "off".
     */
    hubAtom: runtime.atom(get => {
      if (!get(userSettingsLoadedAtom)) {
        setHubAvailability({ _tag: 'connecting' });
        return Effect.never;
      }
      const enabled = get(appOrchestratedAgentsEnabledAtom);
      // A change after the first load (never the load itself): already-active sessions hold the old `mcpServers`, so
      // reactivate them, once the availability below is set so their `session/load` / `session/resume` never reads a
      // stale one. It runs on its own fiber, so this atom re-running does not interrupt it.
      const changed = enabledChange.changed(enabled);
      // On: set `connecting` before any async work: `HubMount` mounts ahead of `AcpBackendsMount`, so by the time a
      // backend can reach its first session RPC the hub reads `connecting` and that RPC waits for it (`awaitHub`)
      // instead of finding it unavailable and starting the session without a credential for good.
      setHubAvailability(enabled ? { _tag: 'connecting' } : { _tag: 'unavailable', reason: HUB_DISABLED_REASON });
      if (changed) {
        get.set(reactivateActiveSessionsAtomFn, undefined);
      }
      if (!enabled) {
        return Effect.void;
      }
      return hostHubClientOptions(get.registry).pipe(
        Effect.flatMap(runHubClient),
        Effect.catchTag('HubUnavailable', error =>
          Effect.sync(() => {
            setHubAvailability({ _tag: 'unavailable', reason: error.reason });
          }),
        ),
      );
    }),
  };
};
