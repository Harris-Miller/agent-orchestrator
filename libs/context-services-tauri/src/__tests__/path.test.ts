import { assert, describe, it } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { Path } from 'effect/Path';

import { mapTauriPlatformToNode } from '../mapTauriPlatform.ts';
import { makeWin32Path, PathLive } from '../PathLive.ts';

describe('mapTauriPlatformToNode', () => {
  it('maps macos to darwin', () => {
    assert.strictEqual(mapTauriPlatformToNode('macos'), 'darwin');
  });

  it('maps windows to win32', () => {
    assert.strictEqual(mapTauriPlatformToNode('windows'), 'win32');
  });

  it('keeps linux', () => {
    assert.strictEqual(mapTauriPlatformToNode('linux'), 'linux');
  });
});

describe('makeWin32Path', () => {
  const path = makeWin32Path();

  it('detects drive-letter absolute paths', () => {
    assert.isTrue(path.isAbsolute('C:\\Users\\op'));
    assert.isTrue(path.isAbsolute('C:/Users/op'));
    assert.isFalse(path.isAbsolute('Users\\op'));
  });

  it('joins with backslashes', () => {
    assert.strictEqual(path.join('C:\\Users\\op', 'AppData', 'Roaming'), 'C:\\Users\\op\\AppData\\Roaming');
  });

  it('dirname and basename', () => {
    assert.strictEqual(path.dirname('C:\\Users\\op\\file.txt'), 'C:\\Users\\op');
    assert.strictEqual(path.basename('C:\\Users\\op\\file.txt'), 'file.txt');
    assert.strictEqual(path.basename('C:\\Users\\op\\file.txt', '.txt'), 'file');
  });
});

describe('PathLive', () => {
  const osLayer = (platform: string) =>
    Layer.succeed(OS, {
      arch: () => 'arm64',
      cwd: () => '/home/operator',
      env: () => ({}),
      homedir: () => '/home/operator',
      platform: () => platform,
    });

  it.effect('uses posix Path on linux', () =>
    Effect.gen(function* () {
      const path = yield* Path;
      assert.strictEqual(path.sep, '/');
      assert.strictEqual(path.join('/home', 'operator', 'x'), '/home/operator/x');
      assert.isTrue(path.isAbsolute('/home/operator'));
      assert.isFalse(path.isAbsolute('home/operator'));
    }).pipe(Effect.provide(PathLive.pipe(Layer.provide(osLayer('linux'))))),
  );

  it.effect('uses win32 Path on win32', () =>
    Effect.gen(function* () {
      const path = yield* Path;
      assert.strictEqual(path.sep, '\\');
      assert.isTrue(path.isAbsolute('C:\\Users\\op'));
    }).pipe(Effect.provide(PathLive.pipe(Layer.provide(osLayer('win32'))))),
  );
});
