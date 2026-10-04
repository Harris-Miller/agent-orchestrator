/**
 * Bundle @lib/gemini-acp and write acp-adapter-resources/vendor/gemini-acp for file: install.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const vendorDir = path.join(repoRoot, 'acp-adapter-resources/vendor/gemini-acp');
const vendorDistDir = path.join(vendorDir, 'dist');

const build = spawnSync('pnpm', ['exec', 'tsdown'], {
  cwd: packageRoot,
  encoding: 'utf8',
  stdio: 'inherit',
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const distCandidates = ['dist/index.js', 'dist/index.mjs'].map(rel => path.join(packageRoot, rel));
const distIndex = distCandidates.find(candidate => fs.existsSync(candidate));
if (distIndex === undefined) {
  process.stderr.write(`Bundle missing (tried ${distCandidates.join(', ')})\n`);
  process.exit(1);
}

fs.rmSync(vendorDir, { force: true, recursive: true });
fs.mkdirSync(vendorDistDir, { recursive: true });
fs.copyFileSync(distIndex, path.join(vendorDistDir, 'index.js'));
fs.writeFileSync(
  path.join(vendorDir, 'package.json'),
  `${JSON.stringify(
    {
      exports: {
        '.': './dist/index.js',
      },
      main: './dist/index.js',
      name: '@lib/gemini-acp',
      private: true,
      type: 'module',
      version: '0.1.0',
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(`Materialized ${vendorDir}\n`);
