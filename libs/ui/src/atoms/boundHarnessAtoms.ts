/**
 * Module-level Atoms bound to {@link bindHostRuntime}'s Host runtime slot.
 * Load only after the app calls bind (desktop: import `./bindHostRuntime.ts` first).
 */
import { atomRuntime, hostRun, hostRunFork, hostRunPromise, hostRunPromiseExit, hostRuntime } from '../hostRuntime.ts';

import { createChatAtoms } from './chat.atoms.ts';
import { createComposerAtoms } from './composer.atoms.ts';
import { createHandoffAtoms } from './handoff.atoms.ts';
import { createHarnessAtoms } from './harness.atoms.ts';
import { createHubAtoms } from './hub.atoms.ts';
import { createImportSessionsAtoms } from './importSessions.atoms.ts';
import { createIdleSweepAtoms } from './idleSweep.atoms.ts';
import { createKeepAwakeAtoms } from './keepAwake.atoms.ts';
import { createOpenFileAtoms } from './openFile.atoms.ts';
import { createPinnedSessionsAtoms } from './pinnedSessions.atoms.ts';
import { createProvidersAtoms } from './providers.atoms.ts';
import { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import { createThemeAtoms } from './theme.atoms.ts';
import { createNotifierAtoms } from './notifier.atoms.ts';
import { createProjectsAtoms } from './projects.atoms.ts';
import { createUserSettingsAtoms } from './userSettings/userSettings.atoms.ts';
import { createVirtualSessionAtoms } from './virtualSession.atoms.ts';
import { createVscodeExtensionAtoms } from './vscodeExtension.atoms.ts';

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
  appOrchestratedAgentsAtom,
  chatWidthAtom,
  confirmSessionDeleteAtom,
  developerModeAtom,
  keepAwakeEnabledAtom,
  matchVscodeThemeAtom,
  midTurnSendAtom,
  notificationSoundEnabledAtom,
  notificationsEnabledAtom,
  notifyOnlyWhenUnfocusedAtom,
  persistUserSettingsAtomFn,
  setModelPickerPrefsAtom,
  showArchivedSettingAtom,
  themeAtom,
  userSettingsAtom,
} = createUserSettingsAtoms(atomRuntime);

export { modelPickerPrefsAtom } from './userSettings/userSettingsDocument.atoms.ts';

export const { effectiveThemeAtom } = createThemeAtoms({ matchVscodeThemeAtom, themeAtom });

export const { installVscodeExtensionAtomFn, skippedExtensionVersionAtom, vscodeExtensionAvailabilityAtom } =
  createVscodeExtensionAtoms(atomRuntime, { userSettingsAtom });

export const { keepAwakeAtom, keepAwakeSupportedAtom } = createKeepAwakeAtoms(atomRuntime, { keepAwakeEnabledAtom });

export const {
  cancelPromptAtomFn,
  cancelSubagentAtomFn,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
  setConfigOptionAtomFn,
} = createChatAtoms(hostBag);

export const {
  attachComposerImagesAtomFn,
  editComposerAtomFn,
  resendPromptAtomFn,
  submitComposerAtomFn,
  unqueueComposerAtomFn,
} = createComposerAtoms(hostBag);

export const { refreshSessionFsListingAtomFn } = createSessionFsListingAtoms(hostBag, alwaysHiddenGlobsAtom);

const harnessAtoms = createHarnessAtoms(hostBag, { setModelPickerPrefsAtom });

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
  launchTargetAvailabilityAtom,
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
  archiveSessionsAtomFn,
  clearSelectedAtomFn,
  deactivateSessionAtomFn,
  deleteSessionAtomFn,
  forkSessionAtomFn,
  reactivateActiveSessionsAtomFn,
  renameSessionAtomFn,
  stopTrackingProjectAtomFn,
  unarchiveSessionAtomFn,
  unarchiveSessionsAtomFn,
} = createSessionLifecycleAtoms(hostBag, harnessAtoms.restartBackendAwaitingUsable);

export const { hubAtom } = createHubAtoms(atomRuntime, reactivateActiveSessionsAtomFn);

export const {
  closeImportAtomFn,
  importLoadMoreAtomFn,
  importRetryTargetAtomFn,
  importSessionAtomFn,
  openImportAtomFn,
} = createImportSessionsAtoms(hostBag);

export const { idleSweepAtom } = createIdleSweepAtoms(atomRuntime);

export const { handoffSessionAtomFn } = createHandoffAtoms(hostBag);

export const { ensureVirtualSessionAtomFn, patchVirtualSessionAtomFn, setVirtualLaunchTargetAtomFn } =
  createVirtualSessionAtoms(hostBag);

export const { pinSessionAtomFn, unpinSessionAtomFn } = createPinnedSessionsAtoms(hostBag);

export const { addProjectAtomFn } = createProjectsAtoms(hostBag);
