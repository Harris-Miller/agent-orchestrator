/** Bind all Host-runtime Atoms for an app (desktop / VS Code webview). */
import type { HostRuntimeBag } from '../createHostRuntime.ts';

import { createChatAtoms } from './chat.atoms.ts';
import { createHandoffAtoms } from './handoff.atoms.ts';
import { createHarnessAtoms } from './harness.atoms.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import { createUserSettingsAtoms } from './userSettings/userSettings.atoms.ts';

export const createAppAtoms = (runtime: HostRuntimeBag) => ({
  ...createHarnessAtoms(runtime),
  ...createUserSettingsAtoms(runtime.atomRuntime),
  ...createChatAtoms(runtime),
  ...createSessionLifecycleAtoms(runtime),
  ...createHandoffAtoms(runtime),
});

export type AppAtoms = ReturnType<typeof createAppAtoms>;
