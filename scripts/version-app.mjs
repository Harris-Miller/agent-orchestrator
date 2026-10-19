#!/usr/bin/env node
/**
 * Bump the root product version and sync shipping manifests.
 * Usage: pnpm version:app <patch|minor|major|x.y.z|...>
 * Creates one commit; does not create a git tag (CI tags on push to main).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: pnpm version:app <patch|minor|major|x.y.z|...>');
  process.exit(1);
}

execFileSync('pnpm', ['version', ...args, '--no-git-tag-version', '--no-git-checks'], {
  cwd: root,
  stdio: 'inherit',
});

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

const tauriConfPath = path.join(root, 'apps/desktop/src-tauri/tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = version;
fs.writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`);

const cargoTomlPath = path.join(root, 'apps/desktop/src-tauri/Cargo.toml');
const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
const nextCargoToml = cargoToml.replace(/^version = "[^"]+"/m, `version = "${version}"`);
if (nextCargoToml === cargoToml) {
  console.error(`Failed to update version in ${cargoTomlPath}`);
  process.exit(1);
}
fs.writeFileSync(cargoTomlPath, nextCargoToml);

const cargoLockPath = path.join(root, 'apps/desktop/src-tauri/Cargo.lock');
const cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
const nextCargoLock = cargoLock.replace(
  /(\[\[package\]\]\nname = "desktop"\n)version = "[^"]+"/,
  `$1version = "${version}"`,
);
if (nextCargoLock !== cargoLock) {
  fs.writeFileSync(cargoLockPath, nextCargoLock);
}

const vscodePkgPath = path.join(root, 'apps/vscode/package.json');
const vscodePkg = JSON.parse(fs.readFileSync(vscodePkgPath, 'utf8'));
vscodePkg.version = version;
fs.writeFileSync(vscodePkgPath, `${JSON.stringify(vscodePkg, null, 2)}\n`);

const paths = [
  'package.json',
  'apps/desktop/src-tauri/tauri.conf.json',
  'apps/desktop/src-tauri/Cargo.toml',
  'apps/desktop/src-tauri/Cargo.lock',
  'apps/vscode/package.json',
];

execFileSync('git', ['add', ...paths], { cwd: root, stdio: 'inherit' });
execFileSync('git', ['commit', '-m', `chore: release ${version}`], {
  cwd: root,
  stdio: 'inherit',
});

console.log(`Released ${version} (commit only; CI creates tag v${version} on main)`);
