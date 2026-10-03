/** Install package-manager argv for macOS / Windows `fd` installs (no shell). */
export type FdInstallCommand = {
  readonly args: readonly string[];
  readonly command: string;
  readonly label: string;
};

export const macFdInstallCommands = (): readonly FdInstallCommand[] => [
  { args: ['install', 'fd'], command: 'brew', label: 'brew install fd' },
  { args: ['install', 'fd'], command: 'port', label: 'port install fd' },
];

export const windowsFdInstallCommands = (): readonly FdInstallCommand[] => [
  { args: ['install', 'fd'], command: 'scoop', label: 'scoop install fd' },
  { args: ['install', 'fd'], command: 'choco', label: 'choco install fd' },
  { args: ['install', 'sharkdp.fd'], command: 'winget', label: 'winget install sharkdp.fd' },
];

export const linuxFdInstallHintLines = (): readonly string[] => [
  'apt install fd-find',
  'apt-get install fd-find',
  'apk add fd',
  'pacman -S fd',
];

export const fdInstallCommandsForPlatform = (platform: string): readonly FdInstallCommand[] => {
  if (platform === 'darwin') {
    return macFdInstallCommands();
  }
  if (platform === 'win32') {
    return windowsFdInstallCommands();
  }
  return [];
};
