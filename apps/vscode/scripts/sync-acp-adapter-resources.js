/**
 * Prod layout: wipe extension acp-adapter-resources (symlink or dir), copy real tree from repo root.
 * Invoked only from vscode:prepublish / package — not ordinary build/watch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destPath = path.join(extensionRoot, 'acp-adapter-resources');
const sourcePath = path.resolve(extensionRoot, '../../acp-adapter-resources');

if (!fs.existsSync(sourcePath)) {
  console.error(`acp-adapter-resources missing at ${sourcePath}. Run: pnpm install-acp-adapter-deps`);
  process.exit(1);
}

const entries = [
  'node_modules/@agentclientprotocol/codex-acp/dist/index.js',
  'node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
  'node_modules/@lib/gemini-acp/dist/index.js',
];
for (const relative of entries) {
  const entry = path.join(sourcePath, relative);
  if (!fs.existsSync(entry)) {
    console.error(`Adapter entry missing at ${entry}. Run: pnpm install-acp-adapter-deps`);
    process.exit(1);
  }
}

fs.rmSync(destPath, { force: true, recursive: true });
fs.cpSync(sourcePath, destPath, { dereference: true, recursive: true });
console.log(`Copied ${sourcePath} → ${destPath}`);
