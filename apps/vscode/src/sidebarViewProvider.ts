import { serveHostIpc } from '@lib/context-services-vscode-webview/protocol';
import * as vscode from 'vscode';

import { makeHostIpcFulfillment, postWorkspaceFoldersChanged } from './host/hostFulfillment';
import type { ProcessTracker } from './host/processTracker';
import { webviewIpcPort } from './host/webviewIpcPort';
import { WEBVIEW_VITE_ORIGIN, WEBVIEW_VITE_WS_ORIGIN } from './webviewDevServer';

const getNonce = function (): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

const shellStyles = `
      html,
      body,
      #root {
        box-sizing: border-box;
        height: 100%;
        margin: 0;
        overflow: hidden;
        padding: 0;
        width: 100%;
      }
      body {
        background: transparent;
        color: var(--vscode-foreground);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
      }
    `;

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agentOrchestrator.sidebar';

  private readonly context: vscode.ExtensionContext;
  private nextWebviewId = 0;
  private readonly tracker: ProcessTracker;

  public constructor(context: vscode.ExtensionContext, tracker: ProcessTracker) {
    this.context = context;
    this.tracker = tracker;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    const webviewId = `wv-${(this.nextWebviewId += 1)}`;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    const port = webviewIpcPort(webviewView.webview);
    const stopServing = serveHostIpc(
      port,
      makeHostIpcFulfillment({
        asAbsolutePath: relativePath => this.context.asAbsolutePath(relativePath),
        port,
        tracker: this.tracker,
        webviewId,
        workspaceFolders: () => vscode.workspace.workspaceFolders,
      }),
    );

    const foldersChanged = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      postWorkspaceFoldersChanged(port, vscode.workspace.workspaceFolders);
    });

    webviewView.onDidDispose(() => {
      stopServing();
      foldersChanged.dispose();
      this.tracker.killAllForWebview(webviewId);
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    // Compile-time: '1' from `watch:main`, '0' from `build:main` (not ExtensionMode).
    const isDev = process.env.WEBVIEW_HMR === '1';

    if (isDev) {
      return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data:; style-src ${webview.cspSource} 'unsafe-inline' ${WEBVIEW_VITE_ORIGIN}; script-src 'nonce-${nonce}' ${WEBVIEW_VITE_ORIGIN}; connect-src ${WEBVIEW_VITE_ORIGIN} ${WEBVIEW_VITE_WS_ORIGIN};"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Orchestrator</title>
    <style>${shellStyles}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}">
      import RefreshRuntime from '${WEBVIEW_VITE_ORIGIN}/@react-refresh'
      RefreshRuntime.injectIntoGlobalHook(window)
      window.$RefreshReg$ = () => {}
      window.$RefreshSig$ = () => (type) => type
      window.__vite_plugin_react_preamble_installed__ = true
    </script>
    <script type="module" nonce="${nonce}" src="${WEBVIEW_VITE_ORIGIN}/@vite/client"></script>
    <script type="module" nonce="${nonce}" src="${WEBVIEW_VITE_ORIGIN}/src/webview/index.tsx"></script>
  </body>
</html>`;
    }

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.css'),
    );

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Orchestrator</title>
    <link href="${String(styleUri)}" rel="stylesheet" />
    <style>${shellStyles}</style>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${String(scriptUri)}"></script>
  </body>
</html>`;
  }
}
