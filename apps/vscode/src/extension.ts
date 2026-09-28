import * as vscode from 'vscode';

import { ProcessTracker } from './host/processTracker';
import { SidebarViewProvider } from './sidebarViewProvider';

const processTracker = new ProcessTracker();

export const activate = function (context: vscode.ExtensionContext): void {
  const provider = new SidebarViewProvider(context, processTracker);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('agentOrchestrator.helloWorld', () =>
      vscode.commands.executeCommand('agentOrchestrator.sidebar.focus'),
    ),
  );
};

export const deactivate = function (): void {
  processTracker.killAll();
};
