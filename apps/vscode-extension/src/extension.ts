import * as vscode from 'vscode';

export const activate = function (context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('agentOrchestrator.helloWorld', () =>
    vscode.window.showInformationMessage('Hello from Agent Orchestrator'),
  );

  context.subscriptions.push(disposable);
};
