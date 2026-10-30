import type { Arch, Platform } from '@tauri-apps/plugin-os';

/**
 * Map Tauri `plugin-os` arch strings to Node-compatible `os.arch()` values.
 */
export const mapTauriArchToNode = (tauriArch: Arch): string => {
  switch (tauriArch) {
    case 'aarch64':
      return 'arm64';
    case 'arm':
      return 'arm';
    case 'mips':
    case 'mips64':
    case 'powerpc':
    case 'powerpc64':
    case 'riscv64':
    case 's390x':
    case 'sparc64':
      return tauriArch;
    case 'x86':
      return 'ia32';
    case 'x86_64':
      return 'x64';
  }
};

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
