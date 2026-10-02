import { Fzf } from 'fzf';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

export type ComposerCommandTriggerKind = 'dollar' | 'slash';

/** Slash-command names hidden from the composer menu per agent. */
const HIDDEN_COMMAND_NAMES: Readonly<Partial<Record<AgentLaunchTarget, ReadonlySet<string>>>> = {
  'claude-agent-acp': new Set(['color', 'config', 'dataviz', 'effect', 'fast', 'model']),
  'codex-acp': new Set(['logout']),
};

const matchesTriggerKind = (command: AvailableCommand, kind: ComposerCommandTriggerKind): boolean =>
  kind === 'dollar' ? command.name.startsWith('$') : !command.name.startsWith('$');

const isHidden = (command: AvailableCommand, launchTarget: AgentLaunchTarget | undefined): boolean => {
  if (launchTarget === undefined) {
    return false;
  }
  return HIDDEN_COMMAND_NAMES[launchTarget]?.has(command.name) ?? false;
};

/** Bare name used for exact query match (`$caveman` → `caveman`). */
const bareCommandName = (name: string): string => (name.startsWith('$') ? name.slice(1) : name);

const fzfFind = (
  commands: readonly AvailableCommand[],
  query: string,
  selector: (command: AvailableCommand) => string,
): readonly AvailableCommand[] => new Fzf(commands, { selector }).find(query).map(result => result.item);

/**
 * Filter `availableCommands` for a trigger kind. Empty query lists all of that kind;
 * non-empty query: exact bare-name matches first, then fzf name hits, then description
 * hits (no duplicates). Per-agent hidden names are dropped.
 */
export const filterAvailableCommands = (
  availableCommands: readonly AvailableCommand[],
  kind: ComposerCommandTriggerKind,
  query: string,
  launchTarget?: AgentLaunchTarget,
): readonly AvailableCommand[] => {
  const forKind = availableCommands.filter(
    command => matchesTriggerKind(command, kind) && !isHidden(command, launchTarget),
  );
  if (query.length === 0) {
    return forKind;
  }
  if (forKind.length === 0) {
    return [];
  }

  const exact = forKind.filter(command => bareCommandName(command.name) === query);
  const remaining = forKind.filter(command => bareCommandName(command.name) !== query);
  const byName = fzfFind(remaining, query, command => command.name);
  const seen = new Set(byName);
  const byDescription = fzfFind(remaining, query, command => command.description ?? '').filter(
    command => !seen.has(command),
  );
  return [...exact, ...byName, ...byDescription];
};
