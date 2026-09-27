/** Desktop Host runtime bind (Tauri Live). Import this module before any @lib/ui Atoms. */
import { TauriServicesLive } from '@lib/context-services-tauri';
import { bindHostRuntime, createHostRuntime } from '@lib/ui/host-runtime';

bindHostRuntime(createHostRuntime(TauriServicesLive));

export {
  atomRuntime,
  bindHostRuntime,
  createHostRuntime,
  hostRun,
  hostRunFork,
  hostRunPromise,
  hostRunPromiseExit,
  hostRuntime,
} from '@lib/ui/host-runtime';
