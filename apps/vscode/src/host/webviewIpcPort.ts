import type { IpcPort } from '@lib/context-services-vscode-webview/protocol';
import type * as vscode from 'vscode';

type WebviewWithTransfer = vscode.Webview & {
  postMessage: (message: unknown, transfer?: readonly ArrayBuffer[]) => PromiseLike<boolean>;
};

const ignore = (): undefined => undefined;

/** {@link IpcPort} adapter over a VS Code webview (extension end of Host IPC). */
export const webviewIpcPort = (webview: vscode.Webview): IpcPort => ({
  onMessage: handler => {
    const subscription = webview.onDidReceiveMessage((raw: unknown) => {
      handler(raw);
    });
    return () => {
      subscription.dispose();
    };
  },
  postMessage: (message, transfer) => {
    const posted =
      transfer === undefined
        ? webview.postMessage(message)
        : (webview as WebviewWithTransfer).postMessage(message, transfer);
    posted.then(ignore, ignore);
  },
});
