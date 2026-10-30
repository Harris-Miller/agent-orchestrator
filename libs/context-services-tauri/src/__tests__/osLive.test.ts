import { assert, describe, layer } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { invoke } from '@tauri-apps/api/core';
import { Config, Effect, Layer } from 'effect';
import { vi } from 'vitest';

import { ConfigProviderLive } from '../ConfigProviderLive.ts';
import { OSLive } from '../OSLive.ts';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/path', () => ({
  homeDir: vi.fn(() => Promise.resolve('/Users/dev')),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  arch: vi.fn(() => 'aarch64'),
  platform: vi.fn(() => 'macos'),
}));

const mockedInvoke = vi.mocked(invoke);

mockedInvoke.mockResolvedValue({
  cwd: '/Users/dev/project',
  env: { CURSOR_API_KEY: 'host-key', PATH: '/usr/bin' },
});

describe('OSLive + ConfigProviderLive', () => {
  layer(ConfigProviderLive.pipe(Layer.provideMerge(OSLive)))(it => {
    it.effect('exposes cwd/env from host_process_info and Config CURSOR_API_KEY', () =>
      Effect.gen(function* () {
        const key = yield* Config.NonEmptyString('CURSOR_API_KEY');
        assert.strictEqual(key, 'host-key');

        const os = yield* OS;
        assert.strictEqual(os.cwd(), '/Users/dev/project');
        assert.strictEqual(os.env().CURSOR_API_KEY, 'host-key');
        assert.strictEqual(os.arch(), 'arm64');
        assert.strictEqual(os.homedir(), '/Users/dev');
        assert.strictEqual(os.platform(), 'darwin');
      }),
    );
  });
});
