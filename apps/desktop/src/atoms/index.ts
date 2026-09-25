/** Public ACP Effect Atom surface for the desktop app. */
export { acpRuntime, createAcpRuntime, hostServicesLayer } from './acpRuntime.atoms.ts';
export {
  allLaunchTargetPhasesAtom,
  backendHarnessStateAtom,
  providerConfigAtom,
  rpcWireLogLaunchTargetAtom,
  rpcWireLogSnapshotAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  unifiedSessionRosterAtom,
} from './backendState.atoms.ts';
export {
  cancelPromptAtomFn,
  draftAtom,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
  sendChatItemAtomFn,
  setConfigOptionAtomFn,
} from './chat.atoms.ts';
export {
  joinDirectoryAtomFn,
  listChildDirectoriesAtomFn,
  parentDirectoryAtomFn,
  resolveHomeDirAtomFn,
} from './directory.atoms.ts';
export { HandoffError, handoffInProgressAtom, handoffSessionAtomFn } from './handoff.atoms.ts';
export { backendHarnessAtom, restartBackendAtomFn } from './harness.atoms.ts';
export {
  activateSessionAtomFn,
  createSessionAtomFn,
  deactivateSessionAtomFn,
  deleteSessionAtomFn,
  refreshAllSessionRostersAtomFn,
  refreshSessionRosterAtomFn,
  selectSessionAtomFn,
} from './sessionLifecycle.atoms.ts';
export {
  hydrateUserSettingsAtomFn,
  readSettingsAtomFn,
  setHarnessConfigDefaultsAtomFn,
  setThemeAtomFn,
  themeAtom,
  userSettingsAtom,
  userSettingsHydratedAtom,
  userSettingsIoErrorAtom,
  writeUserSettingsAtomFn,
} from './userSettings/index.ts';
