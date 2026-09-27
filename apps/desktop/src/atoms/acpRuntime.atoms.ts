/** Shared Effect Atom runtime for ACP desktop state. */
import type { HostServices } from '@lib/context-services';
import { TauriServicesLive } from '@lib/context-services-tauri';
import { ManagedRuntime } from 'effect';
import type { Layer } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

export const createAcpRuntime = (hostLayer: Layer.Layer<HostServices>) => {
  const acpRuntime = Atom.runtime(() => hostLayer);
  const hostRuntime = ManagedRuntime.make(hostLayer);
  return { acpRuntime, hostRuntime, hostServicesLayer: hostLayer };
};

export const { acpRuntime, hostRuntime, hostServicesLayer } = createAcpRuntime(TauriServicesLive);

export const runHost = hostRuntime.runPromise;
export const runHostExit = hostRuntime.runPromiseExit;
