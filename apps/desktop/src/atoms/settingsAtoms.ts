/** Settings document Atom surface backed by `@lib/ao-home`. */
import { defaultSettings, readSettings, restoreSettingsDefaults, writeSettings } from '@lib/ao-home';
import type { SettingsDocument } from '@lib/ao-home';
import { Cause, Effect, Exit } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { DEFAULT_THEME_ID } from '../theme/theme.ts';
import { isThemeId, readPaintThemeRaw, writePaintThemeId } from '../theme/themePaintCache.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';

export const settingsDocumentAtom = Atom.make<SettingsDocument>(defaultSettings).pipe(Atom.keepAlive);

export const settingsIoErrorAtom = Atom.make<string | undefined>(undefined).pipe(Atom.keepAlive);

/** True after the first hydrate attempt finishes (success or IO error path that still seeded atoms). */
export const settingsHydratedAtom = Atom.make(false).pipe(Atom.keepAlive);

export const readSettingsAtomFn = acpRuntime.fn((_arg: undefined) => readSettings()).pipe(Atom.keepAlive);

export const writeSettingsAtomFn = acpRuntime
  .fn((document: SettingsDocument) => writeSettings(document))
  .pipe(Atom.keepAlive);

const commitSettingsDocument = <E, R>(get: AcpAtomGet, effect: Effect.Effect<SettingsDocument, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(effect);
    if (Exit.isFailure(exit)) {
      get.set(settingsIoErrorAtom, Cause.pretty(exit.cause));
      return false;
    }
    get.set(settingsDocumentAtom, exit.value);
    get.set(settingsIoErrorAtom, undefined);
    return true;
  });

export const writeSettingsDocumentAtomFn = acpRuntime
  .fn(
    Effect.fn('writeSettingsDocumentAtomFn')(function* (document: SettingsDocument, get: AcpAtomGet) {
      yield* commitSettingsDocument(get, writeSettings(document).pipe(Effect.map(() => document)));
    }),
  )
  .pipe(Atom.keepAlive);

export const hydrateSettingsAtomFn = acpRuntime
  .fn(
    Effect.fn('hydrateSettingsAtomFn')(function* (_arg: undefined, get: AcpAtomGet) {
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
          get.set(settingsDocumentAtom, exit.value);
          writePaintThemeId(paintRaw);
          get.set(settingsHydratedAtom, true);
          return;
        }
      }

      const effective = isThemeId(next.theme) ? next.theme : DEFAULT_THEME_ID;
      writePaintThemeId(effective);
      get.set(settingsDocumentAtom, next);
      get.set(settingsIoErrorAtom, undefined);
      get.set(settingsHydratedAtom, true);
    }),
  )
  .pipe(Atom.keepAlive);

export const restoreSettingsDefaultsAtomFn = acpRuntime
  .fn(
    Effect.fn('restoreSettingsDefaultsAtomFn')(function* (_arg: undefined, get: AcpAtomGet) {
      const ok = yield* commitSettingsDocument(get, restoreSettingsDefaults());
      if (ok) {
        writePaintThemeId(DEFAULT_THEME_ID);
      }
    }),
  )
  .pipe(Atom.keepAlive);
