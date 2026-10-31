import { assert, describe, it } from '@effect/vitest';

import { buildAntigravitySpawnEnv } from './antigravityEnv.ts';

describe('buildAntigravitySpawnEnv', () => {
  it('scrubs ambient Google / AGY / BROWSER keys and sets controlled BROWSER', () => {
    const env = buildAntigravitySpawnEnv({
      antigravityAcpHome: '/home/operator/.ao/providers/antigravity-acp/home',
      baseEnv: {
        AGY_ACP_ENABLE_OAUTH: '1',
        BROWSER: 'chrome',
        GEMINI_API_KEY: 'secret',
        GEMINI_HOME: '/wrong',
        GOOGLE_API_KEY: 'g',
        HOME: '/home/operator',
        PATH: '/usr/bin',
      },
      browserHelperPath: '/home/operator/.ao/providers/antigravity-acp/browser-helper',
      harnessPath: '/home/operator/.ao/providers/antigravity-acp/runtime/1.4.1/localharness_external',
      platform: 'darwin',
    });

    assert.strictEqual(env.BROWSER, '/home/operator/.ao/providers/antigravity-acp/browser-helper');
    assert.strictEqual(env.GEMINI_API_KEY, undefined);
    assert.strictEqual(env.GOOGLE_API_KEY, undefined);
    assert.strictEqual(env.AGY_ACP_ENABLE_OAUTH, undefined);
    assert.strictEqual(env.GEMINI_HOME, '/home/operator/.ao/providers/antigravity-acp/home');
    assert.strictEqual(env.AGY_ACP_FORCE_FILE_STORAGE, '1');
    assert.strictEqual(env.PATH, '/usr/bin');
    assert.strictEqual(env.PYTHONUNBUFFERED, '1');
    assert.strictEqual(
      env.ANTIGRAVITY_HARNESS_PATH,
      '/home/operator/.ao/providers/antigravity-acp/runtime/1.4.1/localharness_external',
    );
  });
});
