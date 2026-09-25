/** In-memory provider config catalog + harness defaults per launch target. */
import { Atom } from 'effect/unstable/reactivity';

import type { AgentLaunchTarget } from '../../acp/agentLaunchTarget.ts';
import type { ProviderConfigStored } from '../../acp/providerConfigStorage.ts';

export const providerConfigAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make<ProviderConfigStored | undefined>(undefined).pipe(
    Atom.withLabel(`providerConfig:${launchTarget}`),
    Atom.keepAlive,
  ),
);
