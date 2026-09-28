/**
 * Module-level Atoms bound to {@link bindHostRuntime}'s Host runtime slot.
 * Load only after the app calls bind (desktop: import `./bindHostRuntime.ts` first).
 */
import { atomRuntime, hostRun, hostRunFork, hostRunPromise, hostRunPromiseExit, hostRuntime } from '../hostRuntime.ts';

import { createChatAtoms } from './chat.atoms.ts';
import { createHandoffAtoms } from './handoff.atoms.ts';
import { createHarnessAtoms } from './harness.atoms.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import { createUserSettingsAtoms } from './userSettings/userSettings.atoms.ts';

const hostBag = {
  atomRuntime,
  hostRun,
  hostRunFork,
  hostRunPromise,
  hostRunPromiseExit,
  hostRuntime,
};

export const { backendHarnessAtom, restartBackendAtomFn } = createHarnessAtoms(hostBag);

export const { confirmSessionDeleteAtom, developerModeAtom, persistUserSettingsAtomFn, themeAtom, userSettingsAtom } =
  createUserSettingsAtoms(atomRuntime);

export const {
  cancelPromptAtomFn,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
  sendChatItemAtomFn,
  setConfigOptionAtomFn,
} = createChatAtoms(hostBag);

export const {
  activateSessionAtomFn,
  createSessionAtomFn,
  deactivateSessionAtomFn,
  deleteSessionAtomFn,
  refreshAllSessionRostersAtomFn,
  refreshSessionRosterAtomFn,
  selectSessionAtomFn,
} = createSessionLifecycleAtoms(hostBag);

export const { handoffSessionAtomFn } = createHandoffAtoms(hostBag);
