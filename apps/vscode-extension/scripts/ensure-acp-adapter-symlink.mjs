/**
 * Dev layout: symlink apps/vscode-extension/acp-adapter-resources → repo-root acp-adapter-resources.
 * Darwin symlink; Windows needs Developer Mode (no junction fallback).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const linkPath = path.join(extensionRoot, 'acp-adapter-resources');
const targetPath = path.resolve(extensionRoot, '../../acp-adapter-resources');
const relativeTarget = path.relative(extensionRoot, targetPath);

if (!fs.existsSync(targetPath)) {
  console.error(
    `acp-adapter-resources missing at ${targetPath}. Run: pnpm materialize-acp-adapters`,
  );
  process.exit(1);
}

try {
  const stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink() && path.resolve(extensionRoot, fs.readlinkSync(linkPath)) === targetPath) {
    process.exit(0);
  }
  fs.rmSync(linkPath, { force: true, recursive: true });
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
    throw error;
  }
}

fs.symlinkSync(relativeTarget, linkPath, 'dir');
console.log(`Linked ${linkPath} → ${relativeTarget}`);
