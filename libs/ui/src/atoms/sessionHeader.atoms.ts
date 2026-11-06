/** Session header state: what the header shows for whatever is Selected (glossary: Session header, Session actions). */
import { Atom } from 'effect/reactivity';

import type { UnifiedHistoryEntry } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { sessionChatTitle } from '../host/sessionChatTitle.ts';

import {
  selectedAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  subagentViewAtom,
  unifiedSessionHistoryAtom,
} from './backendState.atoms.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

export type SessionHeaderState = {
  /** `entry` when Session actions show (no Subagent view); undefined hides them. */
  readonly actionsEntry: UnifiedHistoryEntry | undefined;
  /** History entry of the Selected session (archived included); undefined while Virtual, unset or missing a row. */
  readonly entry: UnifiedHistoryEntry | undefined;
  readonly launchTarget: AgentLaunchTarget | undefined;
  readonly title: string;
};

export const sessionHeaderAtom = Atom.make((get): SessionHeaderState => {
  const isVirtual = get(selectedAtom)?._tag === 'Virtual';
  const sessionId = get(selectedSessionIdAtom);
  const launchTarget = isVirtual ? get(virtualSessionAtom)?.launchTarget : get(selectedSessionLaunchTargetAtom);
  const entry =
    sessionId === undefined ? undefined : get(unifiedSessionHistoryAtom).find(row => row.sessionId === sessionId);
  // Session actions act on the Selected session, not the Subagent session on screen.
  return {
    actionsEntry: get(subagentViewAtom) === undefined ? entry : undefined,
    entry,
    launchTarget,
    title: sessionChatTitle(isVirtual, entry, launchTarget),
  };
});
