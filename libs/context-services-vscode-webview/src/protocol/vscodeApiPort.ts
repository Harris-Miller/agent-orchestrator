/// <reference types="vscode-webview" />

import type { IpcPort } from './port.ts';

type VsCodeApiWithTransfer = {
  readonly postMessage: (message: unknown, transfer?: ArrayBuffer[]) => void;
};

/**
 * Wrap `acquireVsCodeApi().postMessage` / `window` message events as an {@link IpcPort}.
 */
export const acquireVsCodeApiPort = (): IpcPort => {
  const api = acquireVsCodeApi() as VsCodeApiWithTransfer;
  return {
    onMessage: handler => {
      const listener = (event: MessageEvent) => {
        handler(event.data);
      };
      window.addEventListener('message', listener);
      return () => {
        window.removeEventListener('message', listener);
      };
    },
    postMessage: (message, transfer) => {
      if (transfer !== undefined && transfer.length > 0) {
        api.postMessage(message, [...transfer]);
        return;
      }
      api.postMessage(message);
    },
  };
};
