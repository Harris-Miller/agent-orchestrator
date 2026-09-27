/** Desktop Host runtime + bound app Atoms (Tauri Live). */
import { TauriServicesLive } from '@lib/context-services-tauri';
import { createAppAtoms, createHostRuntime } from '@lib/ui';

export { createHostRuntime } from '@lib/ui';

export const hostRuntimeBag = createHostRuntime(TauriServicesLive);

export const { atomRuntime, hostRun, hostRunFork, hostRunPromise, hostRunPromiseExit, hostRuntime } = hostRuntimeBag;

export const {
  activateSessionAtomFn,
  backendHarnessAtom,
  cancelPromptAtomFn,
  confirmSessionDeleteAtom,
  createSessionAtomFn,
  deactivateSessionAtomFn,
  deleteSessionAtomFn,
  handoffSessionAtomFn,
  persistUserSettingsAtomFn,
  refreshAllSessionRostersAtomFn,
  refreshSessionRosterAtomFn,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
  restartBackendAtomFn,
  selectSessionAtomFn,
  sendChatItemAtomFn,
  setConfigOptionAtomFn,
  themeAtom,
  userSettingsAtom,
} = createAppAtoms(hostRuntimeBag);

export {
  allLaunchTargetPhasesAtom,
  backendHarnessStateAtom,
  draftAtom,
  handoffInProgressAtom,
  readyLaunchTargetsAtom,
  rpcWireLogLaunchTargetAtom,
  rpcWireLogSnapshotAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  unifiedSessionRosterAtom,
  unwrapUserSettings,
  userSettingsEditsDisabled,
} from '@lib/ui';
