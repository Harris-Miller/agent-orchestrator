import type { Platform } from '@tauri-apps/plugin-os';

/**
 * Map Tauri `plugin-os` platform strings to Node-compatible `os.platform()` values
 * so `@lib/program` checks like `platform() === 'win32'` keep working.
 */
export const mapTauriPlatformToNode = (tauriPlatform: Platform): string => {
  switch (tauriPlatform) {
    case 'android':
      return 'android';
    case 'dragonfly':
      return 'dragonfly';
    case 'freebsd':
      return 'freebsd';
    case 'ios':
      return 'ios';
    case 'linux':
      return 'linux';
    case 'macos':
      return 'darwin';
    case 'netbsd':
      return 'netbsd';
    case 'openbsd':
      return 'openbsd';
    case 'solaris':
      return 'solaris';
    case 'windows':
      return 'win32';
  }
};
