/** Harness config defaults write path over user settings. */
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import type { AgentLaunchTarget } from '../../acp/agentLaunchTarget.ts';
import { patchHarnessConfigDefaults } from '../../acp/providerConfigStorage.ts';
import { acpRuntime } from '../acpRuntime.atoms.ts';

import { userSettingsAtom, writeUserSettingsAtomFn } from './userSettings.atoms.ts';

export const setHarnessConfigDefaultsAtomFn = acpRuntime
  .fn(
    (
      arg: {
        readonly configId: string;
        readonly launchTarget: AgentLaunchTarget;
        readonly value: string;
      },
      get,
    ) =>
      Effect.gen(function* () {
        const settings = get(userSettingsAtom);
        const defaults = {
          ...(settings.harnessConfigDefaults?.[arg.launchTarget] ?? {}),
          [arg.configId]: arg.value,
        };
        yield* get.setResult(writeUserSettingsAtomFn, patchHarnessConfigDefaults(settings, arg.launchTarget, defaults));
      }),
  )
  .pipe(Atom.keepAlive);
