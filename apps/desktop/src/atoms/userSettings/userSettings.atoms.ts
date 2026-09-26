/** User settings write-through Atom backed by `@lib/ao-home`. */
import { defaultSettings, readUserSettings, writeUserSettings } from '@lib/ao-home';
import type { UserSettings } from '@lib/ao-home';
import { Effect, Exit } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import type { createAcpRuntime } from '../acpRuntime.atoms.ts';
import { acpRuntime } from '../acpRuntime.atoms.ts';

type AcpRuntime = ReturnType<typeof createAcpRuntime>['acpRuntime'];

/** Unwrap AsyncResult to UserSettings: Success value, else previousSuccess, else product defaults. */
export const unwrapUserSettings = <E>(result: AsyncResult.AsyncResult<UserSettings, E>): UserSettings =>
  AsyncResult.getOrElse(result, () => defaultSettings);

/** Disable Settings edits only while load is Initial or waiting. */
export const userSettingsEditsDisabled = <E>(result: AsyncResult.AsyncResult<UserSettings, E>): boolean =>
  AsyncResult.isInitial(result) || result.waiting;

export const createUserSettingsAtoms = (runtime: AcpRuntime) => {
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

  return { persistUserSettingsAtomFn, userSettingsAtom };
};

const settingsAtoms = createUserSettingsAtoms(acpRuntime);

export const { userSettingsAtom } = settingsAtoms;
export const { persistUserSettingsAtomFn } = settingsAtoms;
