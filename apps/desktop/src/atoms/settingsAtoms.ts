/** Settings document Atom surface backed by `@lib/ao-home`. */
import { defaultSettings, readSettings, writeSettings } from '@lib/ao-home';
import type { SettingsDocument } from '@lib/ao-home';
import { Cause, Effect, Exit } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';

export const settingsDocumentAtom = Atom.make<SettingsDocument>(defaultSettings).pipe(Atom.keepAlive);

export const settingsIoErrorAtom = Atom.make<string | undefined>(undefined).pipe(Atom.keepAlive);

export const readSettingsAtomFn = acpRuntime.fn((_arg: undefined) => readSettings()).pipe(Atom.keepAlive);

export const writeSettingsAtomFn = acpRuntime
  .fn((document: SettingsDocument) => writeSettings(document))
  .pipe(Atom.keepAlive);

export const hydrateSettingsAtomFn = acpRuntime
  .fn(
    Effect.fn('hydrateSettingsAtomFn')(function* (_arg: undefined, get: AcpAtomGet) {
      const exit = yield* Effect.exit(readSettings());
      if (Exit.isFailure(exit)) {
        get.set(settingsIoErrorAtom, Cause.pretty(exit.cause));
        return;
      }
      get.set(settingsDocumentAtom, exit.value);
      get.set(settingsIoErrorAtom, undefined);
    }),
  )
  .pipe(Atom.keepAlive);

export const restoreSettingsDefaultsAtomFn = acpRuntime
  .fn(
    Effect.fn('restoreSettingsDefaultsAtomFn')(function* (_arg: undefined, get: AcpAtomGet) {
      const exit = yield* Effect.exit(writeSettings(defaultSettings));
      if (Exit.isFailure(exit)) {
        get.set(settingsIoErrorAtom, Cause.pretty(exit.cause));
        return;
      }
      get.set(settingsDocumentAtom, defaultSettings);
      get.set(settingsIoErrorAtom, undefined);
    }),
  )
  .pipe(Atom.keepAlive);
