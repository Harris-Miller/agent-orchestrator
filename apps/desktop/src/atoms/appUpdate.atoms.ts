/** App update (desktop build via the Tauri updater): state atom plus check / download / install actions. Prod only. */
import { isBusyPhase } from '@lib/ui';
import type { AppUpdateView } from '@lib/ui';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import type { Update } from '@tauri-apps/plugin-updater';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

export const appUpdateAtom = Atom.make<AppUpdateView>({ _tag: 'Idle' }).pipe(Atom.keepAlive);

/**
 * Module-level on purpose: this wraps the non-Effect Tauri updater, and the `Update` handle (with its download
 * and install methods) is not serialisable state, so it cannot live in the atom. Set by a check, used by
 * download / install.
 */
let pendingUpdate: Update | undefined;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const isBusy = (state: AppUpdateView): boolean => state._tag === 'Checking' || isBusyPhase(state._tag.toLowerCase());

/** Offline / no release yet: errors are swallowed and the state stays as it was. */
export const checkAppUpdate = async (registry: AtomRegistry.AtomRegistry): Promise<void> => {
  if (!import.meta.env.PROD || isBusy(registry.get(appUpdateAtom))) {
    return;
  }
  const idle = registry.get(appUpdateAtom)._tag === 'Idle';
  if (idle) {
    registry.set(appUpdateAtom, { _tag: 'Checking' });
  }
  const settle = () => {
    if (registry.get(appUpdateAtom)._tag === 'Checking') {
      registry.set(appUpdateAtom, { _tag: 'Idle' });
    }
  };
  try {
    const update = await check();
    // Re-read after the await: a Download may have started (or finished) while the check was in flight, and its
    // state and `pendingUpdate` must not be overwritten.
    const current = registry.get(appUpdateAtom);
    if (update === null || current._tag === 'Ready' || isBusyPhase(current._tag.toLowerCase())) {
      settle();
      return;
    }
    pendingUpdate = update;
    registry.set(appUpdateAtom, { _tag: 'Available', version: update.version });
  } catch {
    settle();
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

/** Re-run a failed App update from the top: check, then download. */
export const retryAppUpdate = async (registry: AtomRegistry.AtomRegistry): Promise<void> => {
  if (registry.get(appUpdateAtom)._tag !== 'Failed') {
    return;
  }
  registry.set(appUpdateAtom, { _tag: 'Idle' });
  await checkAppUpdate(registry);
  await downloadAppUpdate(registry);
};
