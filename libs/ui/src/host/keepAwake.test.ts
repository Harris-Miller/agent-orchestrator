import { assert, describe, it } from '@effect/vitest';

import { keepAwakeHoldCommand } from './keepAwake.ts';

describe('keepAwakeHoldCommand', () => {
  it('holds off idle sleep with /usr/bin/caffeinate on macOS', () => {
    assert.deepStrictEqual(keepAwakeHoldCommand('darwin'), {
      args: ['-i', '/bin/cat'],
      command: '/usr/bin/caffeinate',
    });
  });

  it('takes a logind idle block lock on Linux', () => {
    assert.deepStrictEqual(keepAwakeHoldCommand('linux'), {
      args: [
        '--what=idle',
        '--who=Harness Orchestrating Agents',
        '--why=Agents are working',
        '--mode=block',
        '/bin/cat',
      ],
      command: '/usr/bin/systemd-inhibit',
    });
  });

  it('is unsupported on Windows', () => {
    assert.isUndefined(keepAwakeHoldCommand('win32'));
  });
});
