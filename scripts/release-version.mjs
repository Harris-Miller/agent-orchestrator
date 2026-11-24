/**
 * Release CI: compute the next product version and its notes with semantic-release (dry run: no tag, no release).
 * Usage: node scripts/release-version.mjs <notes-file>
 * Writes `released`, `version` and `tag` to `$GITHUB_OUTPUT`, and the notes to <notes-file> when there is a release.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import semanticRelease from 'semantic-release';

/** No `v*` tag yet: the first release is 0.1.0, not semantic-release's default 1.0.0. */
const FIRST_VERSION = '0.1.0';

const notesFile = process.argv[2];
if (notesFile === undefined) {
  console.error('Usage: node scripts/release-version.mjs <notes-file>');
  process.exit(1);
}

const output = (/** @type {Record<string, string>} */ values) => {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, lines.join(''));
  }
  process.stdout.write(lines.join(''));
};

const result = await semanticRelease({ dryRun: true });

if (result === false || result.nextRelease === undefined) {
  output({ released: 'false' });
} else {
  const { lastRelease, nextRelease } = result;
  const version = lastRelease.version ? nextRelease.version : FIRST_VERSION;
  const notes = (nextRelease.notes ?? '').replaceAll(nextRelease.version, version);
  writeFileSync(notesFile, notes);
  output({ released: 'true', tag: `v${version}`, version });
}
