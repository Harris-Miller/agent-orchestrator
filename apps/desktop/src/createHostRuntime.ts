/** Desktop Host + Atom runtime composition (Tauri Live). */
import type { HostServices } from '@lib/context-services';
import { TauriServicesLive } from '@lib/context-services-tauri';
import { ManagedRuntime } from 'effect';
import type { Layer } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

export const createHostRuntime = (hostLayer: Layer.Layer<HostServices>) => {
  const atomRuntime = Atom.runtime(() => hostLayer);
  const hostRuntime = ManagedRuntime.make(hostLayer);
  return { atomRuntime, hostRuntime };
};

export const { atomRuntime, hostRuntime } = createHostRuntime(TauriServicesLive);

export const runHost = hostRuntime.runPromise;
export const runHostExit = hostRuntime.runPromiseExit;
