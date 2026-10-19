/**
 * Module-level Atoms bound to {@link bindHostRuntime}'s Host runtime slot.
 * Load only after the app calls bind (desktop: import `./bindHostRuntime.ts` first).
 */
import { atomRuntime, hostRun, hostRunFork, hostRunPromise, hostRunPromiseExit, hostRuntime } from '../hostRuntime.ts';

import { createChatAtoms } from './chat.atoms.ts';
import { createHandoffAtoms } from './handoff.atoms.ts';
import { createHarnessAtoms } from './harness.atoms.ts';
import { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import { createUserSettingsAtoms } from './userSettings/userSettings.atoms.ts';
import { createVirtualSessionAtoms } from './virtualSession.atoms.ts';

const hostBag = {
  atomRuntime,
  hostRun,
  hostRunFork,
  hostRunPromise,
  hostRunPromiseExit,
  hostRuntime,
};

export const { backendHarnessAtom, restartBackendAtomFn } = createHarnessAtoms(hostBag);

export const {
  alwaysHiddenGlobsAtom,
  confirmSessionDeleteAtom,
  developerModeAtom,
  persistUserSettingsAtomFn,
  showNoFolderGroupAtom,
  themeAtom,
  userSettingsAtom,
} = createUserSettingsAtoms(atomRuntime);

export const {
  cancelPromptAtomFn,
  materializeVirtualThenSendAtomFn,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
  sendChatItemAtomFn,
  setConfigOptionAtomFn,
} = createChatAtoms(hostBag);

export const { refreshSessionFsListingAtomFn } = createSessionFsListingAtoms(hostBag, alwaysHiddenGlobsAtom);

export const {
  activateSessionAtomFn,
  clearSelectedAtomFn,
  createSessionAtomFn,
  deactivateSessionAtomFn,
  deleteSessionAtomFn,
  forkSessionAtomFn,
  refreshAllSessionRostersAtomFn,
  refreshSessionRosterAtomFn,
  selectSessionAtomFn,
} = createSessionLifecycleAtoms(hostBag, refreshSessionFsListingAtomFn);

export const { handoffSessionAtomFn } = createHandoffAtoms(hostBag);

export const { ensureVirtualSessionAtomFn, patchVirtualSessionAtomFn, setVirtualLaunchTargetAtomFn } =
  createVirtualSessionAtoms(hostBag);
