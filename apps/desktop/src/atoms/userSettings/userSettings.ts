/** User settings Atom surface backed by `@lib/ao-home`. */
import { defaultSettings, readSettings, restoreSettingsDefaults, writeSettings } from '@lib/ao-home';
import type { UserSettings } from '@lib/ao-home';
import { Cause, Effect, Exit } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { ALL_AGENT_LAUNCH_TARGETS } from '../../acp/agentLaunchTarget.ts';
import { loadProviderConfig } from '../../acp/providerConfigStorage.ts';
import { DEFAULT_THEME_ID } from '../../theme/theme.ts';
import { isThemeId, readPaintThemeRaw, writePaintThemeId } from '../../theme/themePaintCache.ts';
import { acpRuntime } from '../acpRuntime.ts';
import { providerConfigAtom } from '../backendStateAtoms.ts';

export const userSettingsAtom = Atom.make<UserSettings>(defaultSettings).pipe(Atom.keepAlive);

export const settingsIoErrorAtom = Atom.make<string | undefined>(undefined).pipe(Atom.keepAlive);

/** True after the first hydrate attempt finishes (success or IO error path that still seeded atoms). */
export const settingsHydratedAtom = Atom.make(false).pipe(Atom.keepAlive);

export const readSettingsAtomFn = acpRuntime.fn((_arg: undefined) => readSettings()).pipe(Atom.keepAlive);

export const writeSettingsAtomFn = acpRuntime
  .fn((userSettings: UserSettings) => writeSettings(userSettings))
  .pipe(Atom.keepAlive);

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

const commitUserSettings = <E, R>(get: Atom.FnContext, effect: Effect.Effect<UserSettings, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(effect);
    if (Exit.isFailure(exit)) {
      get.set(settingsIoErrorAtom, Cause.pretty(exit.cause));
      return false;
    }
    get.set(userSettingsAtom, exit.value);
    get.set(settingsIoErrorAtom, undefined);
    syncProviderConfigDefaultsFromSettings(get, exit.value);
    return true;
  });

export const writeUserSettingsAtomFn = acpRuntime
  .fn(
    Effect.fn('writeUserSettingsAtomFn')(function* (userSettings: UserSettings, get: Atom.FnContext) {
      yield* commitUserSettings(get, writeSettings(userSettings).pipe(Effect.map(() => userSettings)));
    }),
  )
  .pipe(Atom.keepAlive);

export const hydrateSettingsAtomFn = acpRuntime
  .fn(
    Effect.fn('hydrateSettingsAtomFn')(function* (_arg: undefined, get: Atom.FnContext) {
      const exit = yield* Effect.exit(readSettings());
      if (Exit.isFailure(exit)) {
        get.set(settingsIoErrorAtom, Cause.pretty(exit.cause));
        get.set(settingsHydratedAtom, true);
        return;
      }

      let next = exit.value;
      const paintRaw = readPaintThemeRaw();

      if (!isThemeId(next.theme) && isThemeId(paintRaw)) {
        next = { ...next, theme: paintRaw };
        const writeExit = yield* Effect.exit(writeSettings(next));
        if (Exit.isFailure(writeExit)) {
          get.set(settingsIoErrorAtom, Cause.pretty(writeExit.cause));
          get.set(userSettingsAtom, exit.value);
          writePaintThemeId(paintRaw);
          get.set(settingsHydratedAtom, true);
          return;
        }
      }

      const effective = isThemeId(next.theme) ? next.theme : DEFAULT_THEME_ID;
      writePaintThemeId(effective);
      get.set(userSettingsAtom, next);
      get.set(settingsIoErrorAtom, undefined);

      for (const launchTarget of ALL_AGENT_LAUNCH_TARGETS) {
        const defaults = next.harnessConfigDefaults?.[launchTarget] ?? {};
        const loaded = yield* Effect.exit(loadProviderConfig(launchTarget, defaults));
        if (Exit.isSuccess(loaded)) {
          get.set(providerConfigAtom(launchTarget), loaded.value);
        }
      }

      get.set(settingsHydratedAtom, true);
    }),
  )
  .pipe(Atom.keepAlive);

export const restoreSettingsDefaultsAtomFn = acpRuntime
  .fn(
    Effect.fn('restoreSettingsDefaultsAtomFn')(function* (_arg: undefined, get: Atom.FnContext) {
      const ok = yield* commitUserSettings(get, restoreSettingsDefaults());
      if (ok) {
        writePaintThemeId(DEFAULT_THEME_ID);
      }
    }),
  )
  .pipe(Atom.keepAlive);
