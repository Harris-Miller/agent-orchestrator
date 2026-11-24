// Package the `.vsix` with this package's `version` (`0.0.0` in dev; release CI sets the computed version before it
// packages). The desktop app bundles the output as `hoa-vscode.vsix`.
import { spawnSync } from 'node:child_process';

const { status } = spawnSync('pnpm', ['exec', 'vsce', 'package', '--no-dependencies', '--out', 'hoa-vscode.vsix'], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
process.exit(status ?? 1);
