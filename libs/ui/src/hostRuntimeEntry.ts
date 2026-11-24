/** Host runtime factory + bind slot — no Atom imports (safe to load before bind). */
export { createHostRuntime, type HostRuntimeBag } from './createHostRuntime.ts';
export {
  atomRuntime,
  bindHostRuntime,
  hostRun,
  hostRunFork,
  hostRunPromise,
  hostRunPromiseExit,
  hostRuntime,
} from './hostRuntime.ts';
export { captureAppOpened } from './analytics/trackEvent.ts';
