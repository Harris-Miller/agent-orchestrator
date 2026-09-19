import * as vscode from 'vscode';

import { SidebarViewProvider } from './sidebarViewProvider';

export const activate = function (context: vscode.ExtensionContext): void {
  const provider = new SidebarViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, provider),
    vscode.commands.registerCommand('agentOrchestrator.helloWorld', () =>
      vscode.commands.executeCommand('agentOrchestrator.sidebar.focus'),
    ),
  );
};
