import * as vscode from 'vscode';

import { handleHostIpcMessage, postWorkspaceFoldersChanged } from './host/hostFulfillment';
import type { ProcessTracker } from './host/processTracker';

const getNonce = function (): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

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

    const subscription = webviewView.webview.onDidReceiveMessage((raw: unknown) => {
      handleHostIpcMessage({
        context: this.context,
        raw,
        tracker: this.tracker,
        webview: webviewView.webview,
        webviewId,
        workspaceFolders: vscode.workspace.workspaceFolders,
      }).then(
        () => undefined,
        () => undefined,
      );
    });

    const foldersChanged = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      postWorkspaceFoldersChanged(webviewView.webview, vscode.workspace.workspaceFolders);
    });

    webviewView.onDidDispose(() => {
      subscription.dispose();
      foldersChanged.dispose();
      this.tracker.killAllForWebview(webviewId);
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.css'),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Orchestrator</title>
    <link href="${String(styleUri)}" rel="stylesheet" />
    <style>
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
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${String(scriptUri)}"></script>
  </body>
</html>`;
  }
}
