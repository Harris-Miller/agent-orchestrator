import { Fzf } from 'fzf';

import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

import type { ComposerTriggerKind } from './composerCommandTokens.ts';

const matchesTriggerKind = (command: AvailableCommand, kind: ComposerTriggerKind): boolean =>
  kind === 'dollar' ? command.name.startsWith('$') : !command.name.startsWith('$');

/**
 * Filter `availableCommands` for a trigger kind. Empty query lists all of that kind;
 * non-empty query runs fzf over name + description.
 */
export const filterAvailableCommands = (
  availableCommands: readonly AvailableCommand[],
  kind: ComposerTriggerKind,
  query: string,
): readonly AvailableCommand[] => {
  const forKind = availableCommands.filter(command => matchesTriggerKind(command, kind));
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
