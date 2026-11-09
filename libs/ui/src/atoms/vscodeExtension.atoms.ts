/** VS Code extension install atoms: status (hidden / manual / ready), Install-or-Update, Skipped extension version. */
import { VscodeExtension } from '@lib/context-services';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { loadVscodeExtensionStatus } from '../host/vscodeExtension.ts';

import { unwrapUserSettings } from './userSettings/userSettings.atoms.ts';
import type { createUserSettingsAtoms } from './userSettings/userSettings.atoms.ts';

type UserSettingsAtoms = ReturnType<typeof createUserSettingsAtoms>;

export const createVscodeExtensionAtoms = (
  runtime: HostRuntimeBag['atomRuntime'],
  { userSettingsAtom }: Pick<UserSettingsAtoms, 'userSettingsAtom'>,
) => {
  const vscodeExtensionStatusAtom = runtime.atom(loadVscodeExtensionStatus).pipe(Atom.keepAlive);

  /** Fails with the CLI's stderr; on success re-reads the installed version so the row shows the new state. */
  const installVscodeExtensionAtomFn = runtime
    .fn((_: undefined, get) =>
      Effect.gen(function* () {
        const extension = yield* VscodeExtension;
        yield* extension.installBundled;
        get.refresh(vscodeExtensionStatusAtom);
      }),
    )
    .pipe(Atom.keepAlive);

  const skippedExtensionVersionAtom = Atom.writable(
    get => unwrapUserSettings(get(userSettingsAtom)).skippedExtensionVersion,
    (ctx, version: string) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), skippedExtensionVersion: version });
    },
  ).pipe(Atom.keepAlive);

  return { installVscodeExtensionAtomFn, skippedExtensionVersionAtom, vscodeExtensionStatusAtom };
};
