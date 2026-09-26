/** Session-delete confirmation projection over user settings. */
import type { UserSettings } from '@lib/ao-home';
import { Atom } from 'effect/unstable/reactivity';

import { unwrapUserSettings, userSettingsAtom } from './userSettings.atoms.ts';

/** Prefer confirming session delete when the Settings field is unset. */
export const confirmSessionDeleteEnabled = (settings: UserSettings): boolean => settings.confirmSessionDelete !== false;

/** Effective confirm-before-delete preference (on when unset). Write patches User settings. */
export const confirmSessionDeleteAtom = Atom.writable(
  get => confirmSessionDeleteEnabled(unwrapUserSettings(get(userSettingsAtom))),
  (ctx, enabled: boolean) => {
    ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), confirmSessionDelete: enabled });
  },
).pipe(Atom.keepAlive);
