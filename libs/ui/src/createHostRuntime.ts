/** Host + Atom runtime factory (Live Layer supplied by the app). */
import type { HostServices } from '@lib/context-services';
import { ManagedRuntime } from 'effect';
import type { Layer } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

export const createHostRuntime = (hostLayer: Layer.Layer<HostServices>) => {
  const atomRuntime = Atom.runtime(() => hostLayer);
  const hostRuntime = ManagedRuntime.make(hostLayer);
  return {
    atomRuntime,
    hostRun: hostRuntime.runSync,
    hostRunFork: hostRuntime.runFork,
    hostRunPromise: hostRuntime.runPromise,
    hostRunPromiseExit: hostRuntime.runPromiseExit,
    hostRuntime,
  };
};

export type HostRuntimeBag = ReturnType<typeof createHostRuntime>;
