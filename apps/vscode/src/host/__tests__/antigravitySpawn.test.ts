import { assert, describe, it } from 'vitest';

import { join, resolve } from 'node:path';

import { resolveAntigravitySpawn } from '../antigravitySpawn';

const HOME = resolve('/home/operator');
const binary = (cmd: string) => ({
  _tag: 'binary',
  archive: 'https://dl.google.com/agy-extensions/a.zip',
  args: ['--uid='],
  cmd,
  platform: 'linux-x86_64',
  sha256: 'a'.repeat(64),
  version: '1.4.5',
});
const doc = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    active: { dir: 'runtime/1.4.5', version: '1.4.5' },
    catalog: [
      {
        dir: 'runtime/1.4.5',
        distribution: binary('agy_acp_server.par'),
        state: { _tag: 'completed' },
        version: '1.4.5',
      },
    ],
    schemaVersion: 1,
    ...overrides,
  });

describe('resolveAntigravitySpawn', () => {
  it('maps the active runtime to its recorded command and arguments', () => {
    assert.deepStrictEqual(resolveAntigravitySpawn(HOME, doc()), {
      args: ['--uid='],
      command: join(HOME, '.hoa', 'providers', 'antigravity-acp', 'runtime', '1.4.5', 'agy_acp_server.par'),
    });
  });

  it('refuses a missing active runtime, a malformed document, and an unsafe command', () => {
    assert.throws(() => resolveAntigravitySpawn(HOME, doc({ active: null })));
    assert.throws(() => resolveAntigravitySpawn(HOME, '{nope'));
    assert.throws(() =>
      resolveAntigravitySpawn(
        HOME,
        doc({
          catalog: [
            {
              dir: 'runtime/1.4.5',
              distribution: binary('../../../../bin/sh'),
              state: { _tag: 'completed' },
              version: '1.4.5',
            },
          ],
        }),
      ),
    );
  });
});
