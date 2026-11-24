/**
 * Release CI: compute the next product version and its notes with semantic-release (dry run: no tag, no release).
 * Usage: node scripts/release-version.ts <notes-file>
 * Writes `released`, `version` and `tag` to `$GITHUB_OUTPUT`, and the notes to <notes-file> when there is a release.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import semanticRelease, { type Options } from 'semantic-release';

/** No `v*` tag yet: the first release is 0.1.0, not semantic-release's default 1.0.0. */
const FIRST_VERSION = '0.1.0';

/**
 * semantic-release config, passed inline (no `release.config.*`: cosmiconfig can't load a `.ts` config with TypeScript 7).
 * Release CI only computes the next version and notes from it; CI creates the tag and the GitHub Release itself.
 */
const config: Options = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'eslint',
        // Alpha: every releasable tag is a patch. Beta: `New` and `Breaking` → minor. 1.x: `New` → minor, `Breaking` → major.
        // Other tags (`Docs`, `Build`, `Upgrade`, `Chore`) don't trigger a release.
        releaseRules: [
          { tag: 'Breaking', release: 'patch' },
          { tag: 'Fix', release: 'patch' },
          { tag: 'Update', release: 'patch' },
          { tag: 'New', release: 'patch' },
        ],
      },
    ],
    ['@semantic-release/release-notes-generator', { preset: 'eslint' }],
  ],
};

const notesFile = process.argv[2];
if (notesFile === undefined) {
  console.error('Usage: node scripts/release-version.ts <notes-file>');
  process.exit(1);
}

const output = (values: Record<string, string>) => {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, lines.join(''));
  }
  process.stdout.write(lines.join(''));
};

const result = await semanticRelease({ ...config, dryRun: true });

if (result === false || result.nextRelease === undefined) {
  output({ released: 'false' });
} else {
  const { lastRelease, nextRelease } = result;
  const version = lastRelease.version ? nextRelease.version : FIRST_VERSION;
  // Only the header line carries the version; entries may mention other versions.
  const [header = '', ...rest] = (nextRelease.notes ?? '').split('\n');
  const notes = [header.replaceAll(nextRelease.version, version), ...rest].join('\n');
  writeFileSync(notesFile, notes);
  output({ released: 'true', tag: `v${version}`, version });
}
