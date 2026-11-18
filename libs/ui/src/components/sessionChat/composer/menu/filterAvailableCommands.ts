import { Fzf } from 'fzf';

import type { AgentLaunchTarget } from '../../../../host/agentLaunchTarget.ts';
import type { AvailableCommand } from '../../../../host/sessionUpdateReducer.ts';

export type ComposerCommandTriggerKind = 'dollar' | 'slash';

export type AvailableCommandMatchField = 'description' | 'name';

export type AvailableCommandMatch = {
  readonly command: AvailableCommand;
  readonly field: AvailableCommandMatchField;
  readonly positions: ReadonlySet<number>;
};

export const EMPTY_FZF_POSITIONS: ReadonlySet<number> = new Set();

/** Slash-command names hidden from the composer menu per agent. */
const HIDDEN_COMMAND_NAMES: Readonly<Partial<Record<AgentLaunchTarget, ReadonlySet<string>>>> = {
  'claude-agent-acp': new Set(['color', 'config', 'dataviz', 'effect', 'fast', 'model']),
  'codex-acp': new Set(['logout']),
};

const matchesTriggerKind = (command: AvailableCommand, kind: ComposerCommandTriggerKind): boolean =>
  kind === 'dollar' ? command.isSkill : true;

const isHidden = (command: AvailableCommand, launchTarget: AgentLaunchTarget | undefined): boolean => {
  if (launchTarget === undefined) {
    return false;
  }
  return HIDDEN_COMMAND_NAMES[launchTarget]?.has(command.name) ?? false;
};

/** Bare name used for exact query match (`$caveman` → `caveman`). */
const bareCommandName = (name: string): string => (name.startsWith('$') ? name.slice(1) : name);

/** Character indices of the bare name within `command.name` (for exact-query highlight). */
export const bareNameMatchPositions = (name: string): ReadonlySet<number> => {
  const bare = bareCommandName(name);
  if (bare.length === 0) {
    return EMPTY_FZF_POSITIONS;
  }
  const start = name.startsWith('$') ? 1 : 0;
  const positions = new Set<number>();
  for (let index = 0; index < bare.length; index += 1) {
    positions.add(start + index);
  }
  return positions;
};

type FzfMatch = {
  readonly command: AvailableCommand;
  readonly positions: ReadonlySet<number>;
};

const fzfFind = (
  commands: readonly AvailableCommand[],
  query: string,
  selector: (command: AvailableCommand) => string,
): readonly FzfMatch[] =>
  new Fzf(commands, { selector }).find(query).map(result => ({
    command: result.item,
    positions: result.positions,
  }));

/**
 * Filter `availableCommands` for a trigger kind, keeping fzf match positions.
 * Empty query lists all of that kind (no positions); non-empty: exact bare-name
 * matches first, then fzf name hits, then description hits (no duplicates).
 * Per-agent hidden names are dropped.
 */
export const filterAvailableCommandMatches = (
  availableCommands: readonly AvailableCommand[],
  kind: ComposerCommandTriggerKind,
  query: string,
  launchTarget?: AgentLaunchTarget,
): readonly AvailableCommandMatch[] => {
  const forKind = availableCommands.filter(
    command => matchesTriggerKind(command, kind) && !isHidden(command, launchTarget),
  );
  if (query.length === 0) {
    return forKind.map(command => ({ command, field: 'name' as const, positions: EMPTY_FZF_POSITIONS }));
  }
  if (forKind.length === 0) {
    return [];
  }

  const exact = forKind
    .filter(command => bareCommandName(command.name) === query)
    .map((command): AvailableCommandMatch => ({
      command,
      field: 'name',
      positions: bareNameMatchPositions(command.name),
    }));
  const remaining = forKind.filter(command => bareCommandName(command.name) !== query);
  const byName = fzfFind(remaining, query, command => command.name).map((match): AvailableCommandMatch => ({
    command: match.command,
    field: 'name',
    positions: match.positions,
  }));
  const seen = new Set(byName.map(match => match.command));
  const byDescription = fzfFind(remaining, query, command => command.description ?? '')
    .filter(match => !seen.has(match.command))
    .map((match): AvailableCommandMatch => ({
      command: match.command,
      field: 'description',
      positions: match.positions,
    }));
  return [...exact, ...byName, ...byDescription];
};
