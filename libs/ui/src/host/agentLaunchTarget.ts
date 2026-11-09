/** Agent launch target identity: type, mounted list, and display labels. */

import { LaunchTargetSchema } from '@lib/hoa-home';
import type { LaunchTarget } from '@lib/hoa-home';
import { Schema } from 'effect';

declare const process: { readonly env: Record<string, string | undefined> };

export type AgentLaunchTarget = 'antigravity-acp' | 'claude-agent-acp' | 'codex-acp' | 'cursor-acp';

/** Launch targets that spawn a Node ACP adapter from the adapter resource tree. */
export type AcpAdapterLaunchTarget = 'claude-agent-acp' | 'codex-acp';

export const ALL_AGENT_LAUNCH_TARGETS = [
  'codex-acp',
  'claude-agent-acp',
  'antigravity-acp',
  'cursor-acp',
] as const satisfies readonly AgentLaunchTarget[];

/**
 * True when launch target is not beta-gated, or its compile-time `AO_*_BETA` is `'true'`.
 * Uses static `process.env.NAME` so Vite `define` can bake the values.
 */
export const isLaunchTargetEnabled = (launchTarget: AgentLaunchTarget): boolean => {
  switch (launchTarget) {
    case 'antigravity-acp':
      return process.env.AO_ANTIGRAVITY_BETA === 'true';
    case 'claude-agent-acp':
    case 'codex-acp':
      return true;
    case 'cursor-acp':
      return process.env.AO_CURSOR_BETA === 'true';
  }
};

/** Launch targets mounted / shown in this build (beta flags applied). */
export const MOUNTED_AGENT_LAUNCH_TARGETS = ALL_AGENT_LAUNCH_TARGETS.filter(isLaunchTargetEnabled);

/** Only Codex treats `$` as a Composer trigger (Available Commands). */
export const supportsDollarTrigger = (launchTarget: AgentLaunchTarget | undefined): boolean =>
  launchTarget === 'codex-acp';

export const agentLaunchTargetLabel = (launchTarget: AgentLaunchTarget): string => {
  switch (launchTarget) {
    case 'antigravity-acp':
      return 'Antigravity (beta)';
    case 'claude-agent-acp':
      return 'Claude';
    case 'codex-acp':
      return 'Codex';
    case 'cursor-acp':
      return 'Cursor (beta)';
  }
};

/** Decodes an agent launch target into the hoa-home branded `LaunchTarget` (throws only if a target id is not kebab-case). */
export const toLaunchTarget = (launchTarget: AgentLaunchTarget): LaunchTarget =>
  Schema.decodeSync(LaunchTargetSchema)(launchTarget);
