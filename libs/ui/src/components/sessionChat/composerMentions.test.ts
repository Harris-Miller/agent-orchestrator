import { assert, describe, it } from '@effect/vitest';

import {
  listingBasename,
  parseNulPaths,
  recursiveDirListingArgs,
  recursiveFileListingArgs,
  shallowDirListingArgs,
} from '../../host/fdListing.ts';

import { filterFsListingEntries, filterFsListingEntriesAll, MENTION_MENU_LIMIT } from './filterFsListingEntries.ts';
import { absolutePathToFileUrlHref, fsMentionMarkdownLink, mentionMarkdownForEntry } from './mentionMarkdown.ts';

describe('fdListing helpers', () => {
  it('builds shallow argv with optional -H', () => {
    assert.deepStrictEqual(shallowDirListingArgs({ showHidden: false }), ['-t', 'd', '-d', '1', '-0']);
    assert.deepStrictEqual(shallowDirListingArgs({ showHidden: true }), ['-H', '-t', 'd', '-d', '1', '-0']);
  });

  it('builds recursive argv always with -H', () => {
    assert.deepStrictEqual(recursiveDirListingArgs(), ['-t', 'd', '-H', '-0']);
    assert.deepStrictEqual(recursiveFileListingArgs(), ['-t', 'f', '-H', '-0']);
  });

  it('parses NUL paths', () => {
    assert.deepStrictEqual(parseNulPaths('src\0apps\0\0./lib\0'), ['src', 'apps', 'lib']);
  });

  it('listingBasename strips dirs', () => {
    assert.strictEqual(listingBasename('foo/bar/'), 'bar');
    assert.strictEqual(listingBasename('README.md'), 'README.md');
  });
});

describe('filterFsListingEntries', () => {
  const entries = [
    { kind: 'dir' as const, path: 'src/' },
    { kind: 'file' as const, path: 'src/main.ts' },
    { kind: 'file' as const, path: 'README.md' },
  ];

  it('opens on empty query and caps at 50', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      kind: 'file' as const,
      path: `f${String(index)}.ts`,
    }));
    assert.strictEqual(filterFsListingEntries(many, '').length, MENTION_MENU_LIMIT);
    assert.deepStrictEqual(
      filterFsListingEntries(entries, '').map(entry => entry.path),
      ['src/', 'src/main.ts', 'README.md'],
    );
  });

  it('fzf filters by path', () => {
    assert.deepStrictEqual(
      filterFsListingEntries(entries, 'main').map(entry => entry.path),
      ['src/main.ts'],
    );
  });

  it('filterFsListingEntriesAll keeps full empty-query list', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      kind: 'file' as const,
      path: `f${String(index)}.ts`,
    }));
    assert.strictEqual(filterFsListingEntriesAll(many, '').length, 60);
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
