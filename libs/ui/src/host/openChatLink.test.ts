import { assert, describe, it } from '@effect/vitest';
import { OpenFile, OpenFileFailed, OpenUrl, OpenUrlFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layer as posixPathLayer } from 'effect/Path';

import { chatLinkUrlTransform, classifyChatLinkHref, openChatLink } from './openChatLink.ts';

const unsafeScriptHref = ['java', 'script:alert(1)'].join('');

describe('classifyChatLinkHref', () => {
  it('allows only supported URL and file links', () => {
    assert.deepStrictEqual(classifyChatLinkHref('https://example.com', false), {
      kind: 'url',
      url: 'https://example.com/',
    });
    assert.deepStrictEqual(classifyChatLinkHref('http://example.com', false), {
      kind: 'url',
      url: 'http://example.com/',
    });
    assert.strictEqual(classifyChatLinkHref('file:///a/b.ts', true).kind, 'file');
    assert.strictEqual(classifyChatLinkHref('file:relative.ts', true).kind, 'inert');
    for (const href of [
      'file:///a',
      'file://server/x',
      unsafeScriptHref,
      'data:text/html,x',
      'vscode://x',
      'mailto:a@b',
      './x',
      '#frag',
      'bad %',
    ]) {
      assert.strictEqual(classifyChatLinkHref(href, false).kind, 'inert', href);
    }
  });

  it('resolves workspace paths against cwd only when supported', () => {
    assert.deepStrictEqual(classifyChatLinkHref('libs/a.ts#L3', true, '/ws'), {
      cwd: '/ws',
      kind: 'path',
      path: 'libs/a.ts',
    });
    assert.strictEqual(classifyChatLinkHref('/abs/dir', true, '/ws').kind, 'path');
    assert.strictEqual(classifyChatLinkHref('libs/a.ts', false, '/ws').kind, 'inert');
    assert.strictEqual(classifyChatLinkHref('libs/a.ts', true).kind, 'inert');
    assert.strictEqual(classifyChatLinkHref('#frag', true, '/ws').kind, 'inert');
    assert.strictEqual(classifyChatLinkHref('mailto:a@b', true, '/ws').kind, 'inert');
  });

  it('parses line suffixes into path links', () => {
    const path = (p: string, line: number) => ({ cwd: '/ws', kind: 'path' as const, line, path: p });
    assert.deepStrictEqual(classifyChatLinkHref('libs/a.ts:14', true, '/ws'), path('libs/a.ts', 14));
    assert.deepStrictEqual(classifyChatLinkHref('./src/a.ts:14-16', true, '/ws'), path('./src/a.ts', 14));
    assert.deepStrictEqual(classifyChatLinkHref('a.ts:14:3', true, '/ws'), path('a.ts', 14));
    assert.deepStrictEqual(classifyChatLinkHref('a.ts:14', true, '/ws'), path('a.ts', 14));
    assert.strictEqual(classifyChatLinkHref('libs/a.ts:14', false, '/ws').kind, 'inert');
    assert.strictEqual(classifyChatLinkHref('libs/a.ts:14', true).kind, 'inert');
  });

  it('leaves non-file colon-number hrefs unchanged', () => {
    assert.strictEqual(classifyChatLinkHref('tel:123', true, '/ws').kind, 'inert');
    assert.strictEqual(classifyChatLinkHref(['java', 'script:1'].join(''), true, '/ws').kind, 'inert');
    assert.deepStrictEqual(classifyChatLinkHref('http://example.com:8080', true, '/ws'), {
      kind: 'url',
      url: 'http://example.com:8080/',
    });
  });

  it('keeps file hrefs but not file image sources', () => {
    assert.strictEqual(chatLinkUrlTransform('file:///tmp/a.png', 'href'), 'file:///tmp/a.png');
    assert.strictEqual(chatLinkUrlTransform('file:///tmp/a.png', 'src'), '');
    assert.strictEqual(chatLinkUrlTransform(unsafeScriptHref, 'href'), '');
  });
});

describe('openChatLink', () => {
  it.effect('forwards the line to OpenFile.open', () =>
    Effect.gen(function* () {
      const opened: unknown[] = [];
      const layer = Layer.mergeAll(
        Layer.succeed(OpenUrl, { open: () => Effect.void }),
        Layer.succeed(OpenFile, {
          open: (path, line) => Effect.sync(() => opened.push([path, line])),
          openImageData: () => Effect.void,
          supported: true,
        }),
        posixPathLayer,
      );
      yield* openChatLink({ cwd: '/ws', kind: 'path', line: 14, path: 'a.ts' }).pipe(Effect.provide(layer));
      assert.deepStrictEqual(opened, [['/ws/a.ts', 14]]);
    }),
  );

  it.effect('dispatches URL and decoded file path through Host services', () =>
    Effect.gen(function* () {
      const opened: string[] = [];
      const layer = Layer.mergeAll(
        Layer.succeed(OpenUrl, { open: url => Effect.sync(() => opened.push(url)) }),
        Layer.succeed(OpenFile, {
          open: path => Effect.sync(() => opened.push(path)),
          openImageData: () => Effect.void,
          supported: true,
        }),
        posixPathLayer,
      );
      yield* Effect.all([
        openChatLink({ kind: 'url', url: 'https://example.com/' }),
        openChatLink({ kind: 'file', url: new URL('file:///tmp/a%20b.ts#L3') }),
      ]).pipe(Effect.provide(layer));
      const localhost = classifyChatLinkHref('file://localhost/tmp/c.ts', true);
      assert.strictEqual(localhost.kind, 'file');
      if (localhost.kind === 'file') yield* openChatLink(localhost).pipe(Effect.provide(layer));
      assert.deepStrictEqual(opened, ['https://example.com/', '/tmp/a b.ts', '/tmp/c.ts']);
    }),
  );

  it.effect('swallows Host failures', () =>
    Effect.gen(function* () {
      const layer = Layer.mergeAll(
        Layer.succeed(OpenUrl, { open: () => Effect.fail(new OpenUrlFailed({ message: 'failed' })) }),
        Layer.succeed(OpenFile, {
          open: () => Effect.fail(new OpenFileFailed({ message: 'failed' })),
          openImageData: () => Effect.fail(new OpenFileFailed({ message: 'failed' })),
          supported: true,
        }),
        posixPathLayer,
      );
      yield* Effect.all([
        openChatLink({ kind: 'url', url: 'https://example.com/' }),
        openChatLink({ kind: 'file', url: new URL('file:///tmp/example') }),
      ]).pipe(Effect.provide(layer));
    }),
  );
});
