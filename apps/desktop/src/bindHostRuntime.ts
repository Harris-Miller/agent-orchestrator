/** Desktop Host runtime bind (Tauri Live). Import this module before any @lib/ui Atoms. */
import { TauriServicesLive } from '@lib/context-services-tauri';
import { bindHostRuntime, captureAppOpened, createHostRuntime } from '@lib/ui/host-runtime';

const hostBag = createHostRuntime(TauriServicesLive);
bindHostRuntime(hostBag);
// Once per bootstrap; fire-and-forget.
hostBag.hostRunFork(captureAppOpened);
