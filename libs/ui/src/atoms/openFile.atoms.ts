import { OpenFile } from '@lib/context-services';
import { Effect } from 'effect';

import type { HostRuntimeBag } from '../createHostRuntime.ts';

/** Atoms over the Host's OpenFile service. */
export const createOpenFileAtoms = (runtime: HostRuntimeBag['atomRuntime']) => ({
  openFileSupportedAtom: runtime.atom(Effect.map(OpenFile, service => service.supported)),
});
