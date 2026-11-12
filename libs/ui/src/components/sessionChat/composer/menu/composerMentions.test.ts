import { assert, describe, it } from '@effect/vitest';

import {
  fdExcludeArgs,
  listingBasename,
  listingPathBoldFrom,
  parseNulPaths,
  recursiveDirListingArgs,
  recursiveFileListingArgs,
  shallowDirListingArgs,
} from '../../../../host/fdListing.ts';

import { basenameMatchPositions, filterFsListingMatches } from './filterFsListingEntries.ts';
import { absolutePathToFileUrlHref, fsMentionMarkdownLink, mentionMarkdownForEntry } from './mentionMarkdown.ts';

const assertNoIgnoreBypass = (args: readonly string[]) => {
  assert.isFalse(args.includes('-I'));
  assert.isFalse(args.some(arg => arg.startsWith('--no-ignore')));
};

describe('fdListing helpers', () => {
  it('builds exclude args with .git then user globs', () => {
    assert.deepStrictEqual(fdExcludeArgs([]), ['-E', '.git']);
    assert.deepStrictEqual(fdExcludeArgs(['node_modules', '.git', 'dist']), [
      '-E',
      '.git',
      '-E',
      'node_modules',
      '-E',
      'dist',
    ]);
  });

  it('builds shallow argv with optional -H and excludes', () => {
    assert.deepStrictEqual(shallowDirListingArgs(false), ['-t', 'd', '-d', '1', '-E', '.git', '-0']);
    assert.deepStrictEqual(shallowDirListingArgs(true), ['-H', '-t', 'd', '-d', '1', '-E', '.git', '-0']);
    const withGlobs = shallowDirListingArgs(true, ['node_modules']);
    assert.deepStrictEqual(withGlobs, ['-H', '-t', 'd', '-d', '1', '-E', '.git', '-E', 'node_modules', '-0']);
    assertNoIgnoreBypass(withGlobs);
  });

  it('builds recursive argv with -H and excludes .git + globs', () => {
    assert.deepStrictEqual(recursiveDirListingArgs(), ['-t', 'd', '-H', '-E', '.git', '-0']);
    assert.deepStrictEqual(recursiveFileListingArgs(), ['-t', 'f', '-H', '-E', '.git', '-0']);
    assert.deepStrictEqual(recursiveDirListingArgs(['*.log']), ['-t', 'd', '-H', '-E', '.git', '-E', '*.log', '-0']);
    assertNoIgnoreBypass(recursiveFileListingArgs(['vendor']));
  });

  it('parses NUL paths', () => {
    assert.deepStrictEqual(parseNulPaths('src\0apps\0\0./lib\0'), ['src', 'apps', 'lib']);
  });

  it('listingBasename strips dirs', () => {
    assert.strictEqual(listingBasename('foo/bar/'), 'bar');
    assert.strictEqual(listingBasename('README.md'), 'README.md');
  });

  it('listingPathBoldFrom marks basename (and dir slash)', () => {
    assert.deepStrictEqual(listingPathBoldFrom({ kind: 'file', path: 'src/main.ts' }), {
      boldFrom: 4,
      path: 'src/main.ts',
    });
    assert.deepStrictEqual(listingPathBoldFrom({ kind: 'dir', path: 'src/' }), {
      boldFrom: 0,
      path: 'src/',
    });
  });
});

describe('filterFsListingMatches', () => {
  const entries = [
    { kind: 'dir' as const, path: 'src/' },
    { kind: 'file' as const, path: 'src/main.ts' },
    { kind: 'file' as const, path: 'README.md' },
  ];

  it('opens on empty query with the full listing', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      kind: 'file' as const,
      path: `f${String(index)}.ts`,
    }));
    assert.strictEqual(filterFsListingMatches(many, '').length, 60);
    assert.deepStrictEqual(
      filterFsListingMatches(entries, '').map(match => match.entry.path),
      ['src/', 'src/main.ts', 'README.md'],
    );
  });

  it('fzf filters by path', () => {
    assert.deepStrictEqual(
      filterFsListingMatches(entries, 'main').map(match => match.entry.path),
      ['src/main.ts'],
    );
  });

  it('keeps fzf positions', () => {
    const matches = filterFsListingMatches(entries, 'main');
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0]?.entry.path, 'src/main.ts');
    assert.isTrue(matches[0]?.positions.has(4));
    assert.isTrue(matches[0]?.positions.has(5));
    assert.isTrue(matches[0]?.positions.has(6));
    assert.isTrue(matches[0]?.positions.has(7));
  });

  it('exact basename matches highlight the basename span', () => {
    const entry = { kind: 'file' as const, path: 'src/main.ts' };
    assert.deepStrictEqual(
      [...basenameMatchPositions(entry)].sort((a, b) => a - b),
      [4, 5, 6, 7, 8, 9, 10],
    );
    const matches = filterFsListingMatches(entries, 'main.ts');
    assert.strictEqual(matches[0]?.entry.path, 'src/main.ts');
    assert.deepStrictEqual(
      [...(matches[0]?.positions ?? [])].sort((a, b) => a - b),
      [4, 5, 6, 7, 8, 9, 10],
    );
  });
});

describe('fsMentionMarkdownLink', () => {
  it('prepends @ to label and file:// to absolute paths', () => {
    assert.strictEqual(
      fsMentionMarkdownLink(
        'package.json',
        '/Users/harris/Projects/agent-github-watcher/agent-orchestrator/acp-adapter-resources/package.json',
      ),
      '[@package.json](file:///Users/harris/Projects/agent-github-watcher/agent-orchestrator/acp-adapter-resources/package.json)',
    );
  });

  it('keeps existing @ on label and file:// on href', () => {
    assert.strictEqual(
      fsMentionMarkdownLink('@README.md', 'file:///repo/README.md'),
      '[@README.md](file:///repo/README.md)',
    );
  });

  it('maps Windows paths to file:///C:/…', () => {
    assert.strictEqual(absolutePathToFileUrlHref('C:\\repo\\a.txt'), 'file:///C:/repo/a.txt');
  });
});

describe('mentionMarkdownForEntry', () => {
  it('builds [@basename](file://…) markdown with trailing slash for dirs', () => {
    assert.strictEqual(mentionMarkdownForEntry('/repo', { kind: 'dir', path: 'src/' }), '[@src](file:///repo/src/)');
    assert.strictEqual(
      mentionMarkdownForEntry('/repo', { kind: 'file', path: 'README.md' }),
      '[@README.md](file:///repo/README.md)',
    );
  });
});
