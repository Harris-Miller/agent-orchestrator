import { Notifier } from '@lib/context-services';
import { Effect } from 'effect';

import type { HostRuntimeBag } from '../createHostRuntime.ts';

/** Atoms over the Host's Notifier service. */
export const createNotifierAtoms = (runtime: HostRuntimeBag['atomRuntime']) => ({
  notifierSupportedAtom: runtime.atom(Effect.map(Notifier, service => service.supported)),
});
