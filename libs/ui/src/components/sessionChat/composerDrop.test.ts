import { assert, describe, it } from '@effect/vitest';

import { dropMentionsMarkdown, insertDroppedMentions, pathsFromDataTransfer } from './composerDrop.ts';
import { splitComposerCommandSegments } from './composerCommandTokens.ts';

const transfer = (entries: Record<string, string>) => (type: string) => entries[type] ?? '';

describe('pathsFromDataTransfer', () => {
  it('reads file: URIs from text/uri-list as absolute paths', () => {
    const paths = pathsFromDataTransfer(
      transfer({ 'text/uri-list': 'file:///Users/me/a.ts\r\nfile:///Users/me/my%20dir/\r\n' }),
    );
    assert.deepStrictEqual(paths, ['/Users/me/a.ts', '/Users/me/my dir/']);
  });

  it('ignores non-file schemes and comment lines', () => {
    const paths = pathsFromDataTransfer(
      transfer({ 'text/uri-list': '# comment\nuntitled:Untitled-1\nvscode-remote://host/x\nfile:///etc/hosts' }),
    );
    assert.deepStrictEqual(paths, ['/etc/hosts']);
  });

  it('strips the leading slash before a Windows drive letter', () => {
    const paths = pathsFromDataTransfer(transfer({ 'text/uri-list': 'file:///c%3A/Users/x/a.txt' }));
    assert.deepStrictEqual(paths, ['c:/Users/x/a.txt']);
  });

  it('reads resourceurls JSON arrays and tolerates malformed JSON', () => {
    assert.deepStrictEqual(pathsFromDataTransfer(transfer({ resourceurls: '["file:///tmp/t.md"]' })), ['/tmp/t.md']);
    assert.deepStrictEqual(pathsFromDataTransfer(transfer({ resourceurls: '[not json' })), []);
  });

  it('reads codefiles (Explorer files and folders) and codeeditors (tabs), deduped', () => {
    const paths = pathsFromDataTransfer(
      transfer({
        codeeditors:
          '[{"resource":{"$mid":1,"scheme":"file","path":"/tmp/t.md"}},{"resource":{"scheme":"untitled","path":"x"}}]',
        codefiles: '["/tmp/dir","/tmp/t.md"]',
        resourceurls: '["file:///tmp/t.md"]',
      }),
    );
    assert.deepStrictEqual(paths, ['/tmp/dir', '/tmp/t.md']);
  });
});

describe('dropMentionsMarkdown', () => {
  it('builds one file and one directory mention joined by spaces', () => {
    const markdown = dropMentionsMarkdown([
      { kind: 'file', path: '/Users/me/a.ts' },
      { kind: 'dir', path: '/Users/me/src' },
    ]);
    assert.strictEqual(markdown, '[@a.ts](file:///Users/me/a.ts) [@src](file:///Users/me/src/)');
  });

  it('percent-encodes spaces, percent signs and parentheses in the href', () => {
    const markdown = dropMentionsMarkdown([{ kind: 'file', path: '/Users/me/50% (copy)/a b.md' }]);
    assert.strictEqual(markdown, '[@a b.md](file:///Users/me/50%25%20%28copy%29/a%20b.md)');
  });

  it('labels the filesystem root with its path instead of an empty name', () => {
    assert.strictEqual(dropMentionsMarkdown([{ kind: 'dir', path: '/' }]), '[@/](file:///)');
  });
});

describe('insertDroppedMentions', () => {
  it('appends at the end when there is no cursor, spacing from existing text', () => {
    assert.deepStrictEqual(insertDroppedMentions('look at', null, '[@a](file:///a)'), {
      cursor: 'look at [@a](file:///a) '.length,
      draft: 'look at [@a](file:///a) ',
    });
  });

  it('inserts at a mid-draft cursor and places the caret after the trailing space', () => {
    assert.deepStrictEqual(insertDroppedMentions('hello world', 6, '[@a](file:///a)'), {
      cursor: 6 + '[@a](file:///a)'.length + 1,
      draft: 'hello [@a](file:///a) world',
    });
  });

  it('does not add a leading space into an empty draft', () => {
    assert.deepStrictEqual(insertDroppedMentions('', null, '[@a](file:///a)'), {
      cursor: '[@a](file:///a) '.length,
      draft: '[@a](file:///a) ',
    });
  });
});

describe('splitComposerCommandSegments with dropped mentions', () => {
  it('keeps a mention link with spaces in its label as one markdown-link segment', () => {
    const text = '[@Burning Man 2025 SD card](file:///Users/harris/Pictures/Burning%20Man/) next';
    assert.deepStrictEqual(splitComposerCommandSegments(text, []), [
      {
        href: 'file:///Users/harris/Pictures/Burning%20Man/',
        kind: 'markdownLink',
        label: '@Burning Man 2025 SD card',
      },
      { kind: 'text', value: ' next' },
    ]);
  });
});
