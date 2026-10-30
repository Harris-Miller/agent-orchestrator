/** App-bound Host + Atom runtime slot. Call {@link bindHostRuntime} before loading Atoms. */
import type { HostRuntimeBag } from './createHostRuntime.ts';

let bound: HostRuntimeBag | undefined;

export const bindHostRuntime = (runtime: HostRuntimeBag): void => {
  if (bound !== undefined) {
    throw new Error('bindHostRuntime called twice');
  }
  bound = runtime;
};

const requireBound = (): HostRuntimeBag => {
  if (bound === undefined) {
    throw new Error('bindHostRuntime must run before @lib/ui Atoms load (apps: import host bind before App)');
  }
  return bound;
};

/** Bound Atom runtime — Proxy so Atoms can close over it at module init after bind. */
export const atomRuntime: HostRuntimeBag['atomRuntime'] = new Proxy({} as HostRuntimeBag['atomRuntime'], {
  get(_target, prop, receiver) {
    // oxlint-disable-next-line typescript/no-unsafe-return -- Reflect.get through Proxy
    return Reflect.get(requireBound().atomRuntime, prop, receiver);
  },
});

export const hostRuntime: HostRuntimeBag['hostRuntime'] = new Proxy({} as HostRuntimeBag['hostRuntime'], {
  get(_target, prop, receiver) {
    // oxlint-disable-next-line typescript/no-unsafe-return -- Reflect.get through Proxy
    return Reflect.get(requireBound().hostRuntime, prop, receiver);
  },
});

export const hostRun: HostRuntimeBag['hostRun'] = ((...args: Parameters<HostRuntimeBag['hostRun']>) =>
  requireBound().hostRun(...args)) as HostRuntimeBag['hostRun'];

export const hostRunFork: HostRuntimeBag['hostRunFork'] = ((...args: Parameters<HostRuntimeBag['hostRunFork']>) =>
  requireBound().hostRunFork(...args)) as HostRuntimeBag['hostRunFork'];

export const hostRunPromise: HostRuntimeBag['hostRunPromise'] = ((
  ...args: Parameters<HostRuntimeBag['hostRunPromise']>
) => requireBound().hostRunPromise(...args)) as HostRuntimeBag['hostRunPromise'];

export const hostRunPromiseExit: HostRuntimeBag['hostRunPromiseExit'] = ((
  ...args: Parameters<HostRuntimeBag['hostRunPromiseExit']>
) => requireBound().hostRunPromiseExit(...args)) as HostRuntimeBag['hostRunPromiseExit'];
