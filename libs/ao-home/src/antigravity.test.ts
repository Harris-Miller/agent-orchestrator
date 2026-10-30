import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { beforeEach } from 'vitest';

import {
  ANTIGRAVITY_ACP_BROWSER_HELPER_NAME,
  ANTIGRAVITY_ACP_EXECUTABLE_NAME,
  ANTIGRAVITY_ACP_HARNESS_NAME,
  ANTIGRAVITY_ACP_VERSION,
  antigravityAcpBrowserHelperPath,
  antigravityAcpExecutablePath,
  antigravityAcpHomeDir,
  antigravityAcpRuntimeDir,
  isAntigravityAcpRuntimePresent,
  materializeAntigravityAcpRuntime,
} from './antigravity.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const HOMEDIR = '/home/operator';
const ROOT = `${HOMEDIR}/.ao/antigravity-acp`;

describe('antigravity ao-home paths', () => {
  const store = new Map<string, MapFsEntry>();

  beforeEach(() => {
    store.clear();
  });

  it.effect('resolves home and runtime dirs under ~/.ao/antigravity-acp', () =>
    Effect.gen(function* () {
      const home = yield* antigravityAcpHomeDir();
      const runtime = yield* antigravityAcpRuntimeDir();
      const executable = yield* antigravityAcpExecutablePath();
      const browserHelper = yield* antigravityAcpBrowserHelperPath();
      assert.strictEqual(home, `${ROOT}/home`);
      assert.strictEqual(runtime, `${ROOT}/runtime/${ANTIGRAVITY_ACP_VERSION}`);
      assert.strictEqual(executable, `${runtime}/${ANTIGRAVITY_ACP_EXECUTABLE_NAME}`);
      assert.strictEqual(browserHelper, `${ROOT}/${ANTIGRAVITY_ACP_BROWSER_HELPER_NAME}`);
    }).pipe(Effect.provide(mapFsTestServices(store))),
  );

  it.effect('materialize copies verified members into the runtime dir', () =>
    Effect.gen(function* () {
      store.set('/staging/agy_acp_server.par', { content: 'exe', kind: 'file' });
      store.set('/staging/localharness_external', { content: 'harness', kind: 'file' });

      const result = yield* materializeAntigravityAcpRuntime({
        executableSourcePath: '/staging/agy_acp_server.par',
        harnessSourcePath: '/staging/localharness_external',
      });

      assert.strictEqual(
        result.executablePath,
        `${ROOT}/runtime/${ANTIGRAVITY_ACP_VERSION}/${ANTIGRAVITY_ACP_EXECUTABLE_NAME}`,
      );
      assert.strictEqual(
        result.harnessPath,
        `${ROOT}/runtime/${ANTIGRAVITY_ACP_VERSION}/${ANTIGRAVITY_ACP_HARNESS_NAME}`,
      );
      assert.strictEqual(store.get(result.executablePath)?.kind, 'file');
      assert.strictEqual(store.get(result.harnessPath)?.kind, 'file');
      assert.isTrue(yield* isAntigravityAcpRuntimePresent());
    }).pipe(Effect.provide(mapFsTestServices(store))),
  );

  it.effect('isAntigravityAcpRuntimePresent is false when missing', () =>
    Effect.gen(function* () {
      assert.isFalse(yield* isAntigravityAcpRuntimePresent());
    }).pipe(Effect.provide(mapFsTestServices(store))),
  );
});
