import { assert, describe, it } from '@effect/vitest';

import { sleepInhibitCommand } from './keepAwake.ts';

describe('sleepInhibitCommand', () => {
  it('holds an idle-sleep assertion with caffeinate on macOS', () => {
    assert.deepStrictEqual(sleepInhibitCommand('darwin'), {
      args: ['-i', '/bin/cat'],
      command: '/usr/bin/caffeinate',
    });
  });

  it('takes a logind idle block lock on Linux', () => {
    assert.deepStrictEqual(sleepInhibitCommand('linux'), {
      args: ['--what=idle', '--who=Agent Orchestrator', '--why=Agents are working', '--mode=block', '/bin/cat'],
      command: '/usr/bin/systemd-inhibit',
    });
  });

  it('is unsupported on Windows', () => {
    assert.isUndefined(sleepInhibitCommand('win32'));
  });
});
