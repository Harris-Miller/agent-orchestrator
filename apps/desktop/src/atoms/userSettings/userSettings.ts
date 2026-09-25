/** User settings Atom surface backed by `@lib/ao-home`. */
import { defaultSettings, readSettings, writeSettings } from '@lib/ao-home';
import type { UserSettings } from '@lib/ao-home';
import { Cause, Effect, Exit } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { ALL_AGENT_LAUNCH_TARGETS } from '../../acp/agentLaunchTarget.ts';
import { loadProviderConfig } from '../../acp/providerConfigStorage.ts';
import { acpRuntime } from '../acpRuntime.ts';
import { providerConfigAtom } from '../backendStateAtoms.ts';

export const userSettingsAtom = Atom.make<UserSettings>(defaultSettings).pipe(Atom.keepAlive);

export const userSettingsIoErrorAtom = Atom.make<string | undefined>(undefined).pipe(Atom.keepAlive);

/** True after the first hydrate attempt finishes (success or IO error path that still seeded atoms). */
export const userSettingsHydratedAtom = Atom.make(false).pipe(Atom.keepAlive);

export const readSettingsAtomFn = acpRuntime.fn((_arg: undefined) => readSettings()).pipe(Atom.keepAlive);

const syncProviderConfigDefaultsFromSettings = (get: Atom.FnContext, userSettings: UserSettings) => {
  for (const launchTarget of ALL_AGENT_LAUNCH_TARGETS) {
    const defaults = userSettings.harnessConfigDefaults?.[launchTarget] ?? {};
    const existing = get(providerConfigAtom(launchTarget));
    if (existing !== undefined) {
      get.set(providerConfigAtom(launchTarget), { catalog: existing.catalog, defaults });
    } else if (Object.keys(defaults).length > 0) {
      get.set(providerConfigAtom(launchTarget), { catalog: [], defaults });
    }
  }
};

export const writeUserSettingsAtomFn = acpRuntime
  .fn((userSettings: UserSettings, get) =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(writeSettings(userSettings));
      if (Exit.isFailure(exit)) {
        get.set(userSettingsIoErrorAtom, Cause.pretty(exit.cause));
        return;
      }
      get.set(userSettingsAtom, userSettings);
      get.set(userSettingsIoErrorAtom, undefined);
      syncProviderConfigDefaultsFromSettings(get, userSettings);
    }),
  )
  .pipe(Atom.keepAlive);

export const hydrateUserSettingsAtomFn = acpRuntime
  .fn((_arg, get) =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(readSettings());
      if (Exit.isFailure(exit)) {
        get.set(userSettingsIoErrorAtom, Cause.pretty(exit.cause));
        get.set(userSettingsHydratedAtom, true);
        return;
      }

      const next = exit.value;
      get.set(userSettingsAtom, next);
      get.set(userSettingsIoErrorAtom, undefined);

      for (const launchTarget of ALL_AGENT_LAUNCH_TARGETS) {
        const defaults = next.harnessConfigDefaults?.[launchTarget] ?? {};
        const loaded = yield* Effect.exit(loadProviderConfig(launchTarget, defaults));
        if (Exit.isSuccess(loaded)) {
          get.set(providerConfigAtom(launchTarget), loaded.value);
        }
      }

      get.set(userSettingsHydratedAtom, true);
    }),
  )
  .pipe(Atom.keepAlive);
