// Package the `.vsix` stamped with the desktop app version (single version source: tauri.conf.json) without
// touching package.json. The desktop app bundles the output as `hoa-vscode.vsix`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(new URL('../../desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
);

const { status } = spawnSync(
  'pnpm',
  [
    'exec',
    'vsce',
    'package',
    version,
    '--no-update-package-json',
    '--no-dependencies',
    '--allow-missing-repository',
    '--skip-license',
    '--out',
    'hoa-vscode.vsix',
  ],
  { shell: process.platform === 'win32', stdio: 'inherit' },
);
process.exit(status ?? 1);
