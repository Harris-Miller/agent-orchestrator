import { Fzf } from 'fzf';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

import type { ComposerTriggerKind } from './composerCommandTokens.ts';

/** Slash-command names hidden from the composer menu per agent. */
const HIDDEN_COMMAND_NAMES: Readonly<Partial<Record<AgentLaunchTarget, ReadonlySet<string>>>> = {
  'claude-agent-acp': new Set(['color', 'config', 'dataviz', 'effect', 'fast', 'model']),
  'codex-acp': new Set(['logout']),
};

const matchesTriggerKind = (command: AvailableCommand, kind: ComposerTriggerKind): boolean =>
  kind === 'dollar' ? command.name.startsWith('$') : !command.name.startsWith('$');

const isHidden = (command: AvailableCommand, launchTarget: AgentLaunchTarget | undefined): boolean => {
  if (launchTarget === undefined) {
    return false;
  }
  return HIDDEN_COMMAND_NAMES[launchTarget]?.has(command.name) ?? false;
};

/**
 * Filter `availableCommands` for a trigger kind. Empty query lists all of that kind;
 * non-empty query runs fzf over name + description. Per-agent hidden names are dropped.
 */
export const filterAvailableCommands = (
  availableCommands: readonly AvailableCommand[],
  kind: ComposerTriggerKind,
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
  return new Fzf(forKind, {
    selector: command => `${command.name} ${command.description ?? ''}`,
  })
    .find(query)
    .map(result => result.item);
};
