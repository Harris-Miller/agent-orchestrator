/** Public ACP Effect Atom surface for the desktop app. */
export { acpRuntime, createAcpRuntime, hostServicesLayer } from './acpRuntime.ts';
export {
  allLaunchTargetPhasesAtom,
  backendHarnessStateAtom,
  rpcWireLogLaunchTargetAtom,
  rpcWireLogSnapshotAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  unifiedSessionRosterAtom,
} from './backendStateAtoms.ts';
export {
  cancelPromptAtomFn,
  draftAtom,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
  sendChatItemAtomFn,
  setConfigOptionAtomFn,
} from './chatAtoms.ts';
export {
  joinDirectoryAtomFn,
  listChildDirectoriesAtomFn,
  parentDirectoryAtomFn,
  resolveHomeDirAtomFn,
} from './directoryAtoms.ts';
export { HandoffError, handoffInProgressAtom, handoffSessionAtomFn } from './handoffAtoms.ts';
export { backendHarnessAtom, restartBackendAtomFn } from './harnessAtom.ts';
export {
  activateSessionAtomFn,
  createSessionAtomFn,
  deactivateSessionAtomFn,
  deleteSessionAtomFn,
  refreshAllSessionRostersAtomFn,
  refreshSessionRosterAtomFn,
  selectSessionAtomFn,
} from './sessionLifecycleAtoms.ts';
export {
  hydrateSettingsAtomFn,
  providerConfigAtom,
  readSettingsAtomFn,
  setThemeAtomFn,
  settingsHydratedAtom,
  settingsIoErrorAtom,
  themeAtom,
  userSettingsAtom,
  writeUserSettingsAtomFn,
} from './userSettings/index.ts';
