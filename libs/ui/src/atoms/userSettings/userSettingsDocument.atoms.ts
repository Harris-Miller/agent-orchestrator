/**
 * The in-memory `settings.json`: the app's single copy of User settings. Module-level so Host-runtime-free Atoms can
 * derive from it; `createUserSettingsAtoms` loads it from disk and persists writes. Never mirror a field elsewhere.
 */
import { defaultSettings } from '@lib/hoa-home';
import type { readUserSettings, UserSettings } from '@lib/hoa-home';
import type { Effect } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

export type UserSettingsLoadError = Effect.Error<ReturnType<typeof readUserSettings>>;

export const userSettingsDocumentAtom = Atom.make<AsyncResult.AsyncResult<UserSettings, UserSettingsLoadError>>(
  AsyncResult.initial(),
).pipe(Atom.withLabel('userSettingsDocument'), Atom.keepAlive);

/** Unwrap AsyncResult to UserSettings: Success value, else previousSuccess, else product defaults. */
export const unwrapUserSettings = <E>(result: AsyncResult.AsyncResult<UserSettings, E>): UserSettings =>
  AsyncResult.getOrElse(result, () => defaultSettings);

/** Current User settings for code outside Atom reads (product defaults until loaded). */
export const currentUserSettings = (registry: AtomRegistry.AtomRegistry): UserSettings =>
  unwrapUserSettings(registry.get(userSettingsDocumentAtom));

/** Show archived is off when the Settings field is unset. */
export const showArchivedEnabled = (settings: UserSettings): boolean => settings.showArchived === true;

/** Effective Show archived, read from the User settings document. Toggle through `showArchivedSettingAtom`. */
export const showArchivedAtom = Atom.make(get =>
  showArchivedEnabled(unwrapUserSettings(get(userSettingsDocumentAtom))),
).pipe(Atom.withLabel('showArchived'), Atom.keepAlive);
