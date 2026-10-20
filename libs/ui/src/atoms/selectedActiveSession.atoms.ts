/** Active session for Selected Session arm or Bound Virtual (Triggers / FS / live Config). */
import { Atom } from 'effect/reactivity';

import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';

import {
  backendHarnessStateAtom,
  findLaunchTargetForSessionId,
  selectedAtom,
  selectedSessionAtom,
  unifiedSessionRosterAtom,
} from './backendState.atoms.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

/** Resolved Active session for Selected Session arm or Bound Virtual (cwd for FS listing). */
export type SelectedActiveSession = {
  readonly cwd: string | undefined;
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

/** Bound id when Selected is Virtual; undefined for Session arm or unbound Virtual. */
export const selectedVirtualBoundSessionIdAtom = Atom.make(get => {
  if (get(selectedAtom)?._tag !== 'Virtual') {
    return undefined;
  }
  return get(virtualSessionAtom)?.sessionId;
}).pipe(Atom.keepAlive);

/**
 * Active session for Selected Session arm or Bound Virtual.
 * Does not widen `selectedSessionIdAtom` (Session-arm-only); use this for Triggers / FS / live Config.
 */
export const selectedActiveSessionAtom = Atom.make(get => {
  const selected = get(selectedAtom);
  if (selected?._tag === 'Virtual') {
    const virtual = get(virtualSessionAtom);
    if (virtual?.sessionId === undefined || virtual.launchTarget === undefined) {
      return undefined;
    }
    return {
      cwd: virtual.cwd,
      launchTarget: virtual.launchTarget,
      sessionId: virtual.sessionId,
    } satisfies SelectedActiveSession;
  }
  if (selected?._tag !== 'Session') {
    return undefined;
  }
  const { sessionId } = selected;
  const launchTarget = findLaunchTargetForSessionId(target => get(backendHarnessStateAtom(target)), sessionId);
  if (launchTarget === undefined) {
    return undefined;
  }
  const session = get(selectedSessionAtom);
  const rosterCwd = get(unifiedSessionRosterAtom).find(
    entry => entry.launchTarget === launchTarget && entry.sessionId === sessionId,
  )?.cwd;
  return {
    cwd: session?.cwd ?? rosterCwd,
    launchTarget,
    sessionId,
  } satisfies SelectedActiveSession;
}).pipe(Atom.keepAlive);
