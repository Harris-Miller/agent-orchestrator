/** User settings write-through Atom backed by `@lib/ao-home`. */
import { defaultSettings, normalizeAlwaysHiddenGlobs, readUserSettings, writeUserSettings } from '@lib/ao-home';
import type { UserSettings } from '@lib/ao-home';
import { Effect, Exit } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

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

/** Developer mode is off when the Settings field is unset. */
export const developerModeEnabled = (settings: UserSettings): boolean => settings.developerModeEnabled === true;

/** Prefer showing the No Folder group when the Settings field is unset. */
export const showNoFolderGroupEnabled = (settings: UserSettings): boolean => settings.showNoFolderGroup !== false;

/** Normalized Always-hidden globs (empty when unset). */
export const alwaysHiddenGlobsFromSettings = (settings: UserSettings): readonly string[] =>
  normalizeAlwaysHiddenGlobs(settings.alwaysHiddenGlobs);

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

  /** Effective Developer mode preference (off when unset). Write patches User settings. */
  const developerModeAtom = Atom.writable(
    get => developerModeEnabled(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), developerModeEnabled: enabled });
    },
  ).pipe(Atom.keepAlive);

  /** Effective No Folder group visibility (on when unset). Write patches User settings. */
  const showNoFolderGroupAtom = Atom.writable(
    get => showNoFolderGroupEnabled(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), showNoFolderGroup: enabled });
    },
  ).pipe(Atom.keepAlive);

  /** Normalized Always-hidden globs (empty when unset). Write patches User settings. */
  const alwaysHiddenGlobsAtom = Atom.writable(
    get => alwaysHiddenGlobsFromSettings(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, globs: readonly string[]) => {
      const normalized = normalizeAlwaysHiddenGlobs(globs);
      const current = unwrapUserSettings(ctx.get(userSettingsAtom));
      if (normalized.length === 0) {
        const { alwaysHiddenGlobs: _removed, ...rest } = current;
        ctx.set(userSettingsAtom, rest);
        return;
      }
      ctx.set(userSettingsAtom, { ...current, alwaysHiddenGlobs: [...normalized] });
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

  return {
    alwaysHiddenGlobsAtom,
    confirmSessionDeleteAtom,
    developerModeAtom,
    persistUserSettingsAtomFn,
    showNoFolderGroupAtom,
    themeAtom,
    userSettingsAtom,
  };
};
