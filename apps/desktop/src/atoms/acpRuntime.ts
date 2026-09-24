/** Shared Effect Atom runtime for ACP desktop state. */
import type { HostServices } from '@lib/context-services';
import { TauriServicesLive } from '@lib/context-services-tauri';
import type { Layer } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

export const createAcpRuntime = (hostLayer: Layer.Layer<HostServices>) => {
  const acpRuntime = Atom.runtime(() => hostLayer);
  return { acpRuntime, hostServicesLayer: hostLayer };
};

export const { acpRuntime, hostServicesLayer } = createAcpRuntime(TauriServicesLive);

export type AcpAtomGet = Parameters<Parameters<typeof acpRuntime.fn>[0]>[1];
