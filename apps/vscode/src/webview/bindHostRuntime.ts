/** VS Code webview Host runtime bind. Import before any @lib/ui Atoms. */
import { acquireVsCodeApiPort, IpcClient, makeHostServicesLive } from '@lib/context-services-vscode-webview';
import { bindHostRuntime, captureAppOpened, createHostRuntime } from '@lib/ui/host-runtime';

export const hostIpcClient = new IpcClient(acquireVsCodeApiPort());

const hostBag = createHostRuntime(makeHostServicesLive({ client: hostIpcClient }));
bindHostRuntime(hostBag);
// Once per bootstrap; fire-and-forget.
hostBag.hostRunFork(captureAppOpened);
