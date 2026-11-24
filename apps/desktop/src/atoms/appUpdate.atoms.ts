/** App update (desktop build via the Tauri updater): state atom plus check / download / install actions. Prod only. */
import type { AppUpdateView } from '@lib/ui';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import type { Update } from '@tauri-apps/plugin-updater';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

export const APP_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const appUpdateAtom = Atom.make<AppUpdateView>({ _tag: 'Idle' }).pipe(Atom.keepAlive);

/** The Tauri handle is not serialisable state, so it lives beside the atom. */
let pendingUpdate: Update | undefined;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const isBusy = (state: AppUpdateView): boolean => state._tag === 'Downloading' || state._tag === 'Installing';

/** Offline / no release yet: errors are swallowed and the state stays as it was. */
export const checkAppUpdate = async (registry: AtomRegistry.AtomRegistry): Promise<void> => {
  if (!import.meta.env.PROD || isBusy(registry.get(appUpdateAtom))) {
    return;
  }
  try {
    const update = await check();
    if (update === null || registry.get(appUpdateAtom)._tag === 'Ready') {
      return;
    }
    pendingUpdate = update;
    registry.set(appUpdateAtom, { _tag: 'Available', version: update.version });
  } catch {
    // ignore
  }
};

export const downloadAppUpdate = async (registry: AtomRegistry.AtomRegistry): Promise<void> => {
  const state = registry.get(appUpdateAtom);
  if (state._tag !== 'Available' || pendingUpdate === undefined) {
    return;
  }
  registry.set(appUpdateAtom, { _tag: 'Downloading', version: state.version });
  try {
    await pendingUpdate.download();
    registry.set(appUpdateAtom, { _tag: 'Ready', version: state.version });
  } catch (error) {
    registry.set(appUpdateAtom, { _tag: 'Failed', message: messageOf(error) });
  }
};

export const installAppUpdate = async (registry: AtomRegistry.AtomRegistry): Promise<void> => {
  const state = registry.get(appUpdateAtom);
  if (state._tag !== 'Ready' || pendingUpdate === undefined) {
    return;
  }
  registry.set(appUpdateAtom, { _tag: 'Installing', version: state.version });
  try {
    await pendingUpdate.install();
    await relaunch();
  } catch (error) {
    registry.set(appUpdateAtom, { _tag: 'Failed', message: messageOf(error) });
  }
};
