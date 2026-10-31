import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { antigravityRegistryPlatformKey, resolveAntigravityDistribution } from './antigravityRegistry.ts';
import type { AntigravityRegistry } from './antigravityRegistry.ts';

const sha = 'a'.repeat(64);
const registry = (
  archive = 'https://dl.google.com/agy-extensions/releases/linux/x.zip',
  cmd = './agy_acp_server.par',
) =>
  ({
    distribution: {
      binary: {
        'darwin-aarch64': { archive: 'https://dl.google.com/agy-extensions/releases/macos/a.zip', cmd, sha256: sha },
        'darwin-x86_64': { archive: 'https://dl.google.com/agy-extensions/releases/macos/b.zip', cmd, sha256: sha },
        'linux-x86_64': { archive, args: ['--uid='], cmd, sha256: sha },
      },
    },
    id: 'antigravity-acp',
    version: '1.4.5',
  }) satisfies AntigravityRegistry;

describe('antigravity registry', () => {
  it('maps host arm64/x64 to registry aarch64/x86_64 and excludes windows', () => {
    assert.strictEqual(antigravityRegistryPlatformKey('darwin', 'arm64'), 'darwin-aarch64');
    assert.strictEqual(antigravityRegistryPlatformKey('darwin', 'x64'), 'darwin-x86_64');
    assert.strictEqual(antigravityRegistryPlatformKey('linux', 'x64'), 'linux-x86_64');
    assert.isUndefined(antigravityRegistryPlatformKey('win32', 'x64'));
  });

  it.effect('resolves an exact pinned descriptor with command and arguments', () =>
    Effect.gen(function* () {
      const distribution = yield* resolveAntigravityDistribution(registry(), 'linux', 'x64');
      assert.deepStrictEqual(distribution, {
        _tag: 'binary',
        archive: 'https://dl.google.com/agy-extensions/releases/linux/x.zip',
        args: ['--uid='],
        cmd: 'agy_acp_server.par',
        platform: 'linux-x86_64',
        sha256: sha,
        version: '1.4.5',
      });
    }),
  );

  it.effect('rejects archives outside the Google origin, unsafe commands, and unsupported hosts', () =>
    Effect.gen(function* () {
      yield* resolveAntigravityDistribution(registry('https://evil.example/a.zip'), 'linux', 'x64').pipe(Effect.flip);
      yield* resolveAntigravityDistribution(registry(undefined, './../bin/sh'), 'linux', 'x64').pipe(Effect.flip);
      yield* resolveAntigravityDistribution(registry(), 'win32', 'x64').pipe(Effect.flip);
      yield* resolveAntigravityDistribution(registry(), 'linux', 'arm64').pipe(Effect.flip);
    }),
  );
});
