/** Which port and client kind a Host's hub client uses, and when it must run degraded from the start. */
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { assert, describe, it } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { DEFAULT_HUB_PORT } from '@lib/hub/protocol';
import { Effect, Layer } from 'effect';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';

import { hostHubClientOptions } from './hubLauncher.ts';

/** A temp OS home whose `~/.hoa/settings.json` holds `settings` (none when undefined). */
const hostLayer = (settings: string | undefined, env: Record<string, string> = {}) => {
  const home = mkdtempSync(join(tmpdir(), 'hoa-hub-options-'));
  if (settings !== undefined) {
    mkdirSync(join(home, '.hoa'));
    writeFileSync(join(home, '.hoa', 'settings.json'), settings);
  }
  return Layer.mergeAll(
    NodeFileSystem.layer,
    NodePath.layer,
    Layer.succeed(OS, { arch: () => 'arm64', cwd: () => home, env: () => env, homedir: () => home, platform }),
  );
};

describe('hostHubClientOptions', () => {
  it.effect('uses the default port when the user has not set one', () =>
    Effect.gen(function* () {
      const options = yield* hostHubClientOptions;
      assert.strictEqual(options.port, DEFAULT_HUB_PORT);
      assert.strictEqual(options.clientKind, 'desktop');
    }).pipe(Effect.provide(hostLayer(undefined))),
  );

  it.effect('uses the hubPort User setting, so every client on the machine agrees on another port', () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* hostHubClientOptions).port, 50123);
    }).pipe(Effect.provide(hostLayer('{ "hubPort": 50123, "theme": "dark" }'))),
  );

  it.effect('ignores a hubPort that is not a port', () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* hostHubClientOptions).port, DEFAULT_HUB_PORT);
    }).pipe(Effect.provide(hostLayer('{ "hubPort": "near the window" }'))),
  );

  it.effect('a remote VS Code window runs degraded', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(hostHubClientOptions);
      assert.include(error.reason, 'ssh-remote');
    }).pipe(Effect.provide(hostLayer(undefined, { HOA_HOST: 'vscode', HOA_VSCODE_REMOTE_NAME: 'ssh-remote' }))),
  );
});
