/**
 * Resolve ACP adapter entry paths packaged under the extension (symlink-dev or copy-prod).
 */
import type * as vscode from 'vscode';

import { existsSync } from 'node:fs';

const adapterEntryResource = {
  'claude-agent-acp': 'acp-adapter-resources/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
  'codex-acp': 'acp-adapter-resources/node_modules/@agentclientprotocol/codex-acp/dist/index.js',
  'gemini-acp': 'acp-adapter-resources/node_modules/@lib/gemini-acp/dist/index.js',
} as const;

export type AcpAdapterLaunchTarget = keyof typeof adapterEntryResource;

export class AcpAdapterEntryMissing extends Error {
  readonly executable: string;

  constructor(executable: string, message: string) {
    super(message);
    this.name = 'AcpAdapterEntryMissing';
    this.executable = executable;
  }
}

/** Absolute FS path to a packaged adapter entry; fails if the file is missing. */
export const resolveAcpAdapterEntry = (
  context: Pick<vscode.ExtensionContext, 'asAbsolutePath'>,
  launchTarget: AcpAdapterLaunchTarget,
): string => {
  const relative = adapterEntryResource[launchTarget];
  const absolute = context.asAbsolutePath(relative);
  if (!existsSync(absolute)) {
    throw new AcpAdapterEntryMissing(
      relative,
      `ACP adapter resource not found (${relative}). Run pnpm install-acp-adapter-deps (then materialize-acp-adapters for the symlink) or package the extension (prod copy). Resolved: ${absolute}`,
    );
  }
  return absolute;
};
