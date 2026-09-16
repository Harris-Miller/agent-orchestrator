/** Settings document Atom surface backed by `@lib/ao-home`. */
import { defaultSettings, readSettings, restoreSettingsDefaults, writeSettings } from '@lib/ao-home';
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

const commitSettingsDocument = <E, R>(get: AcpAtomGet, effect: Effect.Effect<SettingsDocument, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(effect);
    if (Exit.isFailure(exit)) {
      get.set(settingsIoErrorAtom, Cause.pretty(exit.cause));
      return;
    }
    get.set(settingsDocumentAtom, exit.value);
    get.set(settingsIoErrorAtom, undefined);
  });

export const hydrateSettingsAtomFn = acpRuntime
  .fn(
    Effect.fn('hydrateSettingsAtomFn')(function* (_arg: undefined, get: AcpAtomGet) {
      yield* commitSettingsDocument(get, readSettings());
    }),
  )
  .pipe(Atom.keepAlive);

export const restoreSettingsDefaultsAtomFn = acpRuntime
  .fn(
    Effect.fn('restoreSettingsDefaultsAtomFn')(function* (_arg: undefined, get: AcpAtomGet) {
      yield* commitSettingsDocument(get, restoreSettingsDefaults());
    }),
  )
  .pipe(Atom.keepAlive);
