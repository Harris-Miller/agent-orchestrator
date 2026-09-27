/** Desktop Host + Atom runtime composition (Tauri Live). */
import { TauriServicesLive } from '@lib/context-services-tauri';
import { createHostRuntime } from '@lib/ui';

export { createHostRuntime } from '@lib/ui';

export const { atomRuntime, hostRun, hostRunFork, hostRunPromise, hostRunPromiseExit, hostRuntime } =
  createHostRuntime(TauriServicesLive);
