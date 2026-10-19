import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';

/** Prod-only: check GitHub Releases and offer to install + relaunch. */
export const checkForAppUpdate = async (): Promise<void> => {
  if (!import.meta.env.PROD) {
    return;
  }

  try {
    const update = await check();
    if (update === null) {
      return;
    }

    const install = await ask(`Version ${update.version} is available. Install and restart?`, {
      kind: 'info',
      okLabel: 'Install',
      title: 'Update available',
    });
    if (!install) {
      return;
    }

    await update.downloadAndInstall();
    await relaunch();
  } catch {
    // Offline / no release yet — ignore.
  }
};
