import { assert, describe, it } from '@effect/vitest';
import type { FileSystem } from 'effect';
import { ByteSize, Effect, Layer, Option } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';

import {
  IMAGE_ATTACH_MAX_BYTES_PER,
  IMAGE_ATTACH_MAX_COUNT,
  ImageAttachmentRejected,
  validateImageAttachments,
} from './composerImageAttachment.ts';
import type { ComposerImageAttachment } from './composerImageAttachment.ts';
import {
  BLOB_EMBED_MAX_BYTES,
  draftToContentBlocks,
  findMarkdownLinks,
  hasEmbeddedContextCapability,
  promptBlocksFromComposerDraft,
  TEXT_EMBED_MAX_BYTES,
} from './draftToContentBlocks.ts';

const pngAttachment = (overrides: Partial<ComposerImageAttachment> = {}): ComposerImageAttachment => ({
  byteLength: 4,
  id: 'a1',
  mimeType: 'image/png',
  name: 'a.png',
  previewDataUrl: 'data:image/png;base64,thumb',
  uri: 'file:///tmp/a.png',
  ...overrides,
});

type MockEntry = { readonly bytes: Uint8Array; readonly type: 'File' } | { readonly type: 'Directory' };

const encoder = new TextEncoder();

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'NotFound',
    method,
    module: 'FileSystem',
    pathOrDescriptor: path,
  });

const fileInfo = (type: FileSystem.File.Type, size: number): FileSystem.File.Info => ({
  atime: Option.none(),
  birthtime: Option.none(),
  blksize: Option.none(),
  blocks: Option.none(),
  dev: 0n,
  gid: Option.none(),
  ino: Option.none(),
  mode: 0,
  mtime: Option.none(),
  nlink: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(size),
  type,
  uid: Option.none(),
});

const mockFsLayer = (entries: ReadonlyMap<string, MockEntry>) =>
  layerNoop({
    exists: path => Effect.succeed(entries.has(path)),
    readFile: path => {
      const entry = entries.get(path);
      if (entry?.type !== 'File') {
        return Effect.fail(notFound('readFile', path));
      }
      return Effect.succeed(entry.bytes);
    },
    stat: path => {
      const entry = entries.get(path);
      if (entry === undefined) {
        return Effect.fail(notFound('stat', path));
      }
      if (entry.type === 'Directory') {
        return Effect.succeed(fileInfo('Directory', 0));
      }
      return Effect.succeed(fileInfo('File', entry.bytes.byteLength));
    },
  });

const withFs = (entries: ReadonlyMap<string, MockEntry>) => Layer.mergeAll(posixPathLayer, mockFsLayer(entries));

describe('findMarkdownLinks', () => {
  it('finds label and href spans', () => {
    const matches = findMarkdownLinks('see [readme](/tmp/readme.md) please');
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0]?.label, 'readme');
    assert.strictEqual(matches[0]?.href, '/tmp/readme.md');
    assert.strictEqual(matches[0]?.start, 4);
    assert.strictEqual(matches[0]?.end, 28);
  });
});

describe('hasEmbeddedContextCapability', () => {
  it('reads normalizeInitialize capability path', () => {
    assert.isTrue(
      hasEmbeddedContextCapability({
        agentCapabilities: { promptCapabilities: { embeddedContext: true } },
      }),
    );
    assert.isFalse(
      hasEmbeddedContextCapability({
        agentCapabilities: { promptCapabilities: { embeddedContext: false } },
      }),
    );
    assert.isFalse(hasEmbeddedContextCapability({}));
  });
});

describe('validateImageAttachments', () => {
  it.effect('rejects unsupported MIME', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(validateImageAttachments([pngAttachment({ mimeType: 'image/heic' })]));
      assert.strictEqual(error._tag, 'ImageAttachmentRejected');
      assert.ok(error instanceof ImageAttachmentRejected);
    }),
  );

  it.effect('rejects over-count', () =>
    Effect.gen(function* () {
      const many = Array.from({ length: IMAGE_ATTACH_MAX_COUNT + 1 }, (_, index) =>
        pngAttachment({ id: String(index), name: `${String(index)}.png`, uri: `file:///tmp/${String(index)}.png` }),
      );
      const error = yield* Effect.flip(validateImageAttachments(many));
      assert.ok(error instanceof ImageAttachmentRejected);
    }),
  );

  it.effect('rejects oversize per image', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateImageAttachments([pngAttachment({ byteLength: IMAGE_ATTACH_MAX_BYTES_PER + 1 })]),
      );
      assert.ok(error instanceof ImageAttachmentRejected);
    }),
  );
});

describe('promptBlocksFromComposerDraft images', () => {
  const init = { agentCapabilities: { promptCapabilities: { embeddedContext: false } } };

  it.effect('attachments → resource_link with mime/size/uri/name (no capability gate)', () =>
    Effect.gen(function* () {
      const blocks = yield* promptBlocksFromComposerDraft('hi', {
        attachments: [pngAttachment()],
        cwd: '/session',
        initializeResult: {},
      });
      assert.deepStrictEqual(blocks, [
        {
          mimeType: 'image/png',
          name: 'a.png',
          size: 4,
          type: 'resource_link',
          uri: 'file:///tmp/a.png',
        },
        { text: 'hi', type: 'text' },
      ]);
    }).pipe(Effect.provide(withFs(new Map()))),
  );

  it.effect('mixed text + FS mention + images → image resource_links then draft blocks', () =>
    Effect.gen(function* () {
      const blocks = yield* promptBlocksFromComposerDraft('see [a](/session/a.txt)', {
        attachments: [pngAttachment()],
        cwd: '/session',
        initializeResult: init,
      });
      assert.deepStrictEqual(blocks, [
        {
          mimeType: 'image/png',
          name: 'a.png',
          size: 4,
          type: 'resource_link',
          uri: 'file:///tmp/a.png',
        },
        { text: 'see ', type: 'text' },
        { name: 'a.txt', type: 'resource_link', uri: 'file:///session/a.txt' },
      ]);
    }).pipe(Effect.provide(withFs(new Map([['/session/a.txt', { bytes: encoder.encode('hi'), type: 'File' }]])))),
  );

  it.effect('image-only → only resource_link blocks, no forced text', () =>
    Effect.gen(function* () {
      const blocks = yield* promptBlocksFromComposerDraft('', {
        attachments: [pngAttachment()],
        cwd: '/session',
        initializeResult: init,
      });
      assert.deepStrictEqual(blocks, [
        {
          mimeType: 'image/png',
          name: 'a.png',
          size: 4,
          type: 'resource_link',
          uri: 'file:///tmp/a.png',
        },
      ]);
    }).pipe(Effect.provide(withFs(new Map()))),
  );

  it.effect('empty text + no images → empty text sentinel', () =>
    Effect.gen(function* () {
      const blocks = yield* promptBlocksFromComposerDraft('', {
        cwd: '/session',
        initializeResult: init,
      });
      assert.deepStrictEqual(blocks, [{ text: '', type: 'text' }]);
    }).pipe(Effect.provide(withFs(new Map()))),
  );

  it.effect('image markdown mid-draft → resource_link at front (not mid-array)', () =>
    Effect.gen(function* () {
      const blocks = yield* promptBlocksFromComposerDraft('before [@shot.png](file:///session/shot.png) after', {
        cwd: '/session',
        initializeResult: init,
      });
      assert.deepStrictEqual(blocks, [
        { name: 'shot.png', type: 'resource_link', uri: 'file:///session/shot.png' },
        { text: 'before ', type: 'text' },
        { text: ' after', type: 'text' },
      ]);
    }).pipe(
      Effect.provide(withFs(new Map([['/session/shot.png', { bytes: encoder.encode('\x89PNG'), type: 'File' }]]))),
    ),
  );

  it.effect('duplicate resource_link uris are de-duplicated (attachment wins over draft)', () =>
    Effect.gen(function* () {
      const blocks = yield* promptBlocksFromComposerDraft('see [@a.png](file:///tmp/a.png)', {
        attachments: [pngAttachment()],
        cwd: '/session',
        initializeResult: init,
      });
      assert.deepStrictEqual(blocks, [
        {
          mimeType: 'image/png',
          name: 'a.png',
          size: 4,
          type: 'resource_link',
          uri: 'file:///tmp/a.png',
        },
        { text: 'see ', type: 'text' },
      ]);
    }).pipe(Effect.provide(withFs(new Map([['/tmp/a.png', { bytes: encoder.encode('\x89PNG'), type: 'File' }]])))),
  );
});

describe('promptBlocksFromComposerDraft images with promptCapabilities.image', () => {
  const initImage = { agentCapabilities: { promptCapabilities: { embeddedContext: false, image: true } } };

  it.effect('attachments → type image with data/mimeType/uri', () =>
    Effect.gen(function* () {
      const blocks = yield* promptBlocksFromComposerDraft('hi', {
        attachments: [pngAttachment()],
        cwd: '/session',
        initializeResult: initImage,
      });
      assert.deepStrictEqual(blocks, [
        {
          data: 'thumb',
          mimeType: 'image/png',
          type: 'image',
          uri: 'file:///tmp/a.png',
        },
        { text: 'hi', type: 'text' },
      ]);
    }).pipe(Effect.provide(withFs(new Map()))),
  );

  it.effect('image-only → only image blocks, no forced text', () =>
    Effect.gen(function* () {
      const blocks = yield* promptBlocksFromComposerDraft('', {
        attachments: [pngAttachment()],
        cwd: '/session',
        initializeResult: initImage,
      });
      assert.deepStrictEqual(blocks, [
        {
          data: 'thumb',
          mimeType: 'image/png',
          type: 'image',
          uri: 'file:///tmp/a.png',
        },
      ]);
    }).pipe(Effect.provide(withFs(new Map()))),
  );

  it.effect('duplicate draft image markdown + attachment → one image block', () =>
    Effect.gen(function* () {
      const blocks = yield* promptBlocksFromComposerDraft('see [@a.png](file:///tmp/a.png)', {
        attachments: [pngAttachment()],
        cwd: '/session',
        initializeResult: initImage,
      });
      assert.deepStrictEqual(blocks, [
        {
          data: 'thumb',
          mimeType: 'image/png',
          type: 'image',
          uri: 'file:///tmp/a.png',
        },
        { text: 'see ', type: 'text' },
      ]);
    }).pipe(Effect.provide(withFs(new Map([['/tmp/a.png', { bytes: encoder.encode('\x89PNG'), type: 'File' }]])))),
  );
});

describe('draftToContentBlocks', () => {
  it.effect('plain text only → single text block', () =>
    Effect.gen(function* () {
      const blocks = yield* draftToContentBlocks('hello /cmd and $mode', {
        cwd: '/session',
        embeddedContext: false,
      });
      assert.deepStrictEqual(blocks, [{ text: 'hello /cmd and $mode', type: 'text' }]);
    }).pipe(Effect.provide(withFs(new Map()))),
  );

  it.effect('URL markdown link stays in text', () =>
    Effect.gen(function* () {
      const blocks = yield* draftToContentBlocks('see [docs](https://example.com) now', {
        cwd: '/session',
        embeddedContext: false,
      });
      assert.deepStrictEqual(blocks, [{ text: 'see [docs](https://example.com) now', type: 'text' }]);
    }).pipe(Effect.provide(withFs(new Map()))),
  );

  it.effect('dir markdown link → resource_link', () =>
    Effect.gen(function* () {
      const blocks = yield* draftToContentBlocks('open [src](/session/src/)', {
        cwd: '/session',
        embeddedContext: false,
      });
      assert.strictEqual(blocks.length, 2);
      assert.deepStrictEqual(blocks[0], { text: 'open ', type: 'text' });
      assert.deepStrictEqual(blocks[1], {
        name: 'src',
        type: 'resource_link',
        uri: 'file:///session/src',
      });
    }).pipe(Effect.provide(withFs(new Map([['/session/src', { type: 'Directory' }]])))),
  );

  it.effect('file without embeddedContext → resource_link', () =>
    Effect.gen(function* () {
      const blocks = yield* draftToContentBlocks('[a](/session/a.txt)', {
        cwd: '/session',
        embeddedContext: false,
      });
      assert.deepStrictEqual(blocks, [{ name: 'a.txt', type: 'resource_link', uri: 'file:///session/a.txt' }]);
    }).pipe(Effect.provide(withFs(new Map([['/session/a.txt', { bytes: encoder.encode('hi'), type: 'File' }]])))),
  );

  it.effect('small text file with embeddedContext → resource text', () =>
    Effect.gen(function* () {
      const blocks = yield* draftToContentBlocks('[a](/session/a.txt)', {
        cwd: '/session',
        embeddedContext: true,
      });
      assert.deepStrictEqual(blocks, [{ resource: { text: 'hello', uri: 'file:///session/a.txt' }, type: 'resource' }]);
    }).pipe(Effect.provide(withFs(new Map([['/session/a.txt', { bytes: encoder.encode('hello'), type: 'File' }]])))),
  );

  it.effect('mid-size text → resource blob', () =>
    Effect.gen(function* () {
      const payload = 'x'.repeat(TEXT_EMBED_MAX_BYTES + 1);
      const bytes = encoder.encode(payload);
      assert.isTrue(bytes.byteLength > TEXT_EMBED_MAX_BYTES);
      assert.isTrue(bytes.byteLength <= BLOB_EMBED_MAX_BYTES);

      const blocks = yield* draftToContentBlocks('[big](/session/big.txt)', {
        cwd: '/session',
        embeddedContext: true,
      });
      assert.strictEqual(blocks.length, 1);
      const [block] = blocks;
      assert.strictEqual(block.type, 'resource');
      if (block.type !== 'resource') {
        return;
      }
      assert.isTrue('blob' in block.resource);
      if (!('blob' in block.resource)) {
        return;
      }
      assert.strictEqual(block.resource.uri, 'file:///session/big.txt');
      assert.strictEqual(atob(block.resource.blob), payload);
    }).pipe(
      Effect.provide(
        withFs(
          new Map([
            ['/session/big.txt', { bytes: encoder.encode('x'.repeat(TEXT_EMBED_MAX_BYTES + 1)), type: 'File' }],
          ]),
        ),
      ),
    ),
  );

  it.effect('file with NUL → resource_link', () =>
    Effect.gen(function* () {
      const blocks = yield* draftToContentBlocks('[bin](/session/bin.dat)', {
        cwd: '/session',
        embeddedContext: true,
      });
      assert.deepStrictEqual(blocks, [{ name: 'bin.dat', type: 'resource_link', uri: 'file:///session/bin.dat' }]);
    }).pipe(
      Effect.provide(withFs(new Map([['/session/bin.dat', { bytes: new Uint8Array([65, 0, 66]), type: 'File' }]]))),
    ),
  );

  it.effect('relative path resolved against cwd', () =>
    Effect.gen(function* () {
      const blocks = yield* draftToContentBlocks('go [rel](notes/todo.md)', {
        cwd: '/session/project',
        embeddedContext: false,
      });
      assert.deepStrictEqual(blocks, [
        { text: 'go ', type: 'text' },
        {
          name: 'todo.md',
          type: 'resource_link',
          uri: 'file:///session/project/notes/todo.md',
        },
      ]);
    }).pipe(
      Effect.provide(
        withFs(new Map([['/session/project/notes/todo.md', { bytes: encoder.encode('todo'), type: 'File' }]])),
      ),
    ),
  );

  it.effect('unresolved FS link stays in text', () =>
    Effect.gen(function* () {
      const blocks = yield* draftToContentBlocks('missing [x](/nope.txt)', {
        cwd: '/session',
        embeddedContext: false,
      });
      assert.deepStrictEqual(blocks, [{ text: 'missing [x](/nope.txt)', type: 'text' }]);
    }).pipe(Effect.provide(withFs(new Map()))),
  );
});
