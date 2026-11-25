import { Atom } from 'effect/reactivity';

import { sameDirectories } from '../host/sessionDirectories.ts';

import {
  backendHarnessSnapshotAtom,
  selectedAtom,
  selectedSessionAtom,
  selectedSessionLaunchTargetAtom,
} from './backendState.atoms.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

/**
 * True when the Selected session (or the Virtual draft) has Additional directories its Agent will not receive because
 * the Agent did not advertise `sessionCapabilities.additionalDirectories`: the composer cwd strip hints that only the
 * first folder is used.
 */
export const extraFoldersIgnoredAtom = Atom.make((get): boolean => {
  const selected = get(selectedAtom);
  if (selected === undefined) return false;
  const virtual = selected._tag === 'Virtual' ? get(virtualSessionAtom) : null;
  const launchTarget = virtual === null ? get(selectedSessionLaunchTargetAtom) : virtual.launchTarget;
  const directories =
    virtual === null ? get(selectedSessionAtom)?.additionalDirectories : virtual.additionalDirectories;
  if (launchTarget === undefined || sameDirectories(directories, undefined)) return false;
  return !get(backendHarnessSnapshotAtom(launchTarget)).agentCapabilities.sessionAdditionalDirectories;
}).pipe(Atom.keepAlive);
