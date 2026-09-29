/** VS Code webview Host runtime bind. Import before any @lib/ui Atoms. */
import { acquireVsCodeApiPort, IpcClient, makeHostServicesLive } from '@lib/context-services-vscode-webview';
import { bindHostRuntime, createHostRuntime } from '@lib/ui/host-runtime';

export const hostIpcClient = new IpcClient(acquireVsCodeApiPort());

bindHostRuntime(createHostRuntime(makeHostServicesLive({ client: hostIpcClient })));
