/** Relative paths into the shared `acp-adapter-resources` tree (desktop + VS Code). */

import entryPaths from './acpAdapterEntryPaths.json' with { type: 'json' };
import type { AcpAdapterLaunchTarget } from './agentLaunchTarget.ts';

export type { AcpAdapterLaunchTarget, AgentLaunchTarget } from './agentLaunchTarget.ts';

export const ACP_ADAPTER_ENTRY_RESOURCE = Object.fromEntries(
  Object.entries(entryPaths).map(([launchTarget, relative]) => [launchTarget, `acp-adapter-resources/${relative}`]),
) as { readonly [K in AcpAdapterLaunchTarget]: `acp-adapter-resources/${(typeof entryPaths)[K]}` };
