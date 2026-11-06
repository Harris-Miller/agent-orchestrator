/** Active session for Selected Session arm or Bound Virtual (Triggers / FS; live Config is Session arm only). */
import { Atom } from 'effect/reactivity';

import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';

import {
  backendHarnessSnapshotAtom,
  findLaunchTargetForSessionId,
  selectedAtom,
  selectedSessionAtom,
  unifiedSessionHistoryAtom,
} from './backendState.atoms.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

/** Resolved Active session for Selected Session arm or Bound Virtual (cwd for FS listing). */
export type SelectedActiveSession = {
  readonly cwd: string | undefined;
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

/**
 * Active session for Selected Session arm or Bound Virtual.
 * Does not widen `selectedSessionIdAtom` (Session-arm-only); use this for Triggers / FS and Session-arm live Config.
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
  const launchTarget = findLaunchTargetForSessionId(target => get(backendHarnessSnapshotAtom(target)), sessionId);
  if (launchTarget === undefined) {
    return undefined;
  }
  const session = get(selectedSessionAtom);
  const historyCwd = get(unifiedSessionHistoryAtom).find(
    entry => entry.launchTarget === launchTarget && entry.sessionId === sessionId,
  )?.cwd;
  return {
    cwd: session?.cwd ?? historyCwd,
    launchTarget,
    sessionId,
  } satisfies SelectedActiveSession;
}).pipe(Atom.keepAlive);
