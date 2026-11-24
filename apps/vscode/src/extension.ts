import { config as loadDotenv } from 'dotenv';
import * as vscode from 'vscode';

import { join } from 'node:path';

import { captureStartupOtelEnv } from './host/hostFulfillment';
import { ProcessTracker } from './host/processTracker';
import { SidebarViewProvider } from './sidebarViewProvider';

const processTracker = new ProcessTracker();

export const activate = function (context: vscode.ExtensionContext): void {
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    // Missing file is fine; dotenv does not override existing process.env keys.
    loadDotenv({
      path: join(context.extensionPath, '.env.development'),
      quiet: true,
    });
  }

  captureStartupOtelEnv();

  const provider = new SidebarViewProvider(context, processTracker);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('hoa.focus', () => vscode.commands.executeCommand('hoa.sidebar.focus')),
  );
};

export const deactivate = function (): void {
  processTracker.killAll();
};
