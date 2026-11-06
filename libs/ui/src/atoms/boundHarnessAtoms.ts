/**
 * Module-level Atoms bound to {@link bindHostRuntime}'s Host runtime slot.
 * Load only after the app calls bind (desktop: import `./bindHostRuntime.ts` first).
 */
import { atomRuntime, hostRun, hostRunFork, hostRunPromise, hostRunPromiseExit, hostRuntime } from '../hostRuntime.ts';

import { createChatAtoms } from './chat.atoms.ts';
import { createHandoffAtoms } from './handoff.atoms.ts';
import { createHarnessAtoms } from './harness.atoms.ts';
import { createOpenFileAtoms } from './openFile.atoms.ts';
import { createPinnedSessionsAtoms } from './pinnedSessions.atoms.ts';
import { createProvidersAtoms } from './providers.atoms.ts';
import { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import { createNotifierAtoms } from './notifier.atoms.ts';
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

export const { notifierSupportedAtom } = createNotifierAtoms(atomRuntime);

export const { openFileSupportedAtom } = createOpenFileAtoms(atomRuntime);

export const {
  alwaysHiddenGlobsAtom,
  confirmSessionDeleteAtom,
  developerModeAtom,
  notificationSoundEnabledAtom,
  notificationsEnabledAtom,
  notifyOnlyWhenUnfocusedAtom,
  persistUserSettingsAtomFn,
  showNoFolderGroupAtom,
  themeAtom,
  userSettingsAtom,
} = createUserSettingsAtoms(atomRuntime);

export const {
  cancelPromptAtomFn,
  cancelSubagentAtomFn,
  materializeVirtualThenSendAtomFn,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
  sendChatItemAtomFn,
  setConfigOptionAtomFn,
  steerChatItemAtomFn,
} = createChatAtoms(hostBag);

export const { refreshSessionFsListingAtomFn } = createSessionFsListingAtoms(hostBag, alwaysHiddenGlobsAtom);

const harnessAtoms = createHarnessAtoms(hostBag, refreshSessionFsListingAtomFn);

export const {
  backendHarnessAtom,
  restartBackendAtomFn,
  signInAntigravityAtomFn,
  startBackendAtomFn,
  stopBackendAtomFn,
} = harnessAtoms;

export const {
  checkLatestAtomFn,
  downloadAtomFn,
  installAtomFn,
  providerViewAtom,
  providerViewsAtom,
  recheckAtomFn,
  refreshProviderAtomFn,
  removeAtomFn,
  setProviderEnabledAtomFn,
  showProvidersOnStartupAtom,
} = createProvidersAtoms(hostBag, harnessAtoms, { userSettingsAtom });

export const {
  activateSessionAtomFn,
  archiveSessionAtomFn,
  clearSelectedAtomFn,
  createSessionAtomFn,
  deactivateSessionAtomFn,
  deleteSessionAtomFn,
  forkSessionAtomFn,
  refreshAllSessionHistoriesAtomFn,
  refreshSessionHistoryAtomFn,
  renameSessionAtomFn,
  selectSessionAtomFn,
} = createSessionLifecycleAtoms(hostBag, refreshSessionFsListingAtomFn, cancelPromptAtomFn);

export const { handoffSessionAtomFn } = createHandoffAtoms(hostBag);

export const {
  discardVirtualSessionAtomFn,
  ensureVirtualSessionAtomFn,
  patchVirtualSessionAtomFn,
  setVirtualLaunchTargetAtomFn,
} = createVirtualSessionAtoms(hostBag, refreshSessionFsListingAtomFn);

export const { pinSessionAtomFn, unpinSessionAtomFn } = createPinnedSessionsAtoms(hostBag);
