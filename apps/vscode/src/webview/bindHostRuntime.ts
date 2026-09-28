/** VS Code webview Host runtime bind. Import before any @lib/ui Atoms. */
import { makeHostServicesLive } from '@lib/context-services-vscode-webview';
import { bindHostRuntime, createHostRuntime } from '@lib/ui/host-runtime';

bindHostRuntime(createHostRuntime(makeHostServicesLive()));
