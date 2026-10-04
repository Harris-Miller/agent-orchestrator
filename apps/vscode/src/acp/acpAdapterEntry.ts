/**
 * Resolve ACP adapter entry paths packaged under the extension (symlink-dev or copy-prod).
 */
import type { AcpAdapterLaunchTarget } from '@lib/ui/acp-adapter-entry';
import { ACP_ADAPTER_ENTRY_RESOURCE } from '@lib/ui/acp-adapter-entry';
import type * as vscode from 'vscode';

import { existsSync } from 'node:fs';

export type { AcpAdapterLaunchTarget } from '@lib/ui/acp-adapter-entry';

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
  const relative = ACP_ADAPTER_ENTRY_RESOURCE[launchTarget];
  const absolute = context.asAbsolutePath(relative);
  if (!existsSync(absolute)) {
    throw new AcpAdapterEntryMissing(
      relative,
      `ACP adapter resource not found (${relative}). Run pnpm install-acp-adapter-deps (then materialize-acp-adapters for the symlink) or package the extension (prod copy). Resolved: ${absolute}`,
    );
  }
  return absolute;
};
