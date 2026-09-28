/**
 * Duplex port for extension↔webview IPC (mirrors VS Code postMessage + transfer list).
 */
export interface IpcPort {
  readonly onMessage: (handler: (message: unknown, transfer?: readonly ArrayBuffer[]) => void) => () => void;
  readonly postMessage: (message: unknown, transfer?: readonly ArrayBuffer[]) => void;
}
