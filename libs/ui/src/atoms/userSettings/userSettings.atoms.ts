/** User settings write-through Atom backed by `@lib/ao-home`. */
import { defaultSettings, readUserSettings, writeUserSettings } from '@lib/ao-home';
import type { UserSettings } from '@lib/ao-home';
import { Effect, Exit } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import type { HostRuntimeBag } from '../../createHostRuntime.ts';
import type { ThemeId } from '../../theme/themeId.ts';
import { clampThemeId, readPaintThemeId, writePaintThemeId } from '../../theme/themePaintCache.ts';

type AtomRuntime = HostRuntimeBag['atomRuntime'];

/** Unwrap AsyncResult to UserSettings: Success value, else previousSuccess, else product defaults. */
export const unwrapUserSettings = <E>(result: AsyncResult.AsyncResult<UserSettings, E>): UserSettings =>
  AsyncResult.getOrElse(result, () => defaultSettings);

/** Disable Settings edits only while load is Initial or waiting. */
export const userSettingsEditsDisabled = <E>(result: AsyncResult.AsyncResult<UserSettings, E>): boolean =>
  AsyncResult.isInitial(result) || result.waiting;

/** Prefer confirming session delete when the Settings field is unset. */
export const confirmSessionDeleteEnabled = (settings: UserSettings): boolean => settings.confirmSessionDelete !== false;

export const createUserSettingsAtoms = (runtime: AtomRuntime) => {
  const loadUserSettingsAtom = runtime.atom(() => readUserSettings()).pipe(Atom.keepAlive);

  /** Subscribe for persist Failure (toast / tests). Not the app write API. */
  const persistUserSettingsAtomFn = runtime
    .fn((userSettings: UserSettings) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(writeUserSettings(userSettings));
        if (Exit.isFailure(exit)) {
          yield* Effect.logError('Failed to persist User settings', exit.cause);
          return yield* Effect.failCause(exit.cause);
        }
      }),
    )
    .pipe(Atom.keepAlive);

  const userSettingsAtom = Atom.writable(
    get => {
      get.mount(persistUserSettingsAtomFn);
      get.subscribe(loadUserSettingsAtom, result => {
        get.setSelf(result);
      });
      return get.once(loadUserSettingsAtom);
    },
    (ctx, next: UserSettings) => {
      ctx.setSelf(AsyncResult.success(next));
      ctx.set(persistUserSettingsAtomFn, next);
    },
  ).pipe(Atom.keepAlive);

  /** Effective confirm-before-delete preference (on when unset). Write patches User settings. */
  const confirmSessionDeleteAtom = Atom.writable(
    get => confirmSessionDeleteEnabled(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), confirmSessionDelete: enabled });
    },
  ).pipe(Atom.keepAlive);

  /** Effective theme: paint cache while settings not Success; User settings after. Write paints + updates settings. */
  const themeAtom = Atom.writable(
    get => {
      const settings = get(userSettingsAtom);
      if (!AsyncResult.isSuccess(settings)) {
        return readPaintThemeId();
      }
      const themeId = clampThemeId(settings.value.theme);
      writePaintThemeId(themeId);
      return themeId;
    },
    (ctx, id: ThemeId) => {
      writePaintThemeId(id);
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), theme: id });
    },
  ).pipe(Atom.keepAlive);

  return { confirmSessionDeleteAtom, persistUserSettingsAtomFn, themeAtom, userSettingsAtom };
};
