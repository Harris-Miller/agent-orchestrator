/**
 * Keep-awake hold: an OS idle-sleep inhibitor child process.
 *
 * No Host service: both Hosts already spawn real OS children of the Host process through `ChildProcessSpawner`
 * (Tauri plugin-shell; VS Code extension host), so the hold is a plain command. Swapping in a Host service later
 * (e.g. a native Windows `SetThreadExecutionState`) is contained to this module.
 *
 * Crash safety via stdin EOF: the inhibitor wraps `/bin/cat`, spawned with stdin piped and never written. Both Hosts
 * keep the pipe open for the child's life; if the Harness dies (even SIGKILL), `cat` reads EOF and exits, releasing
 * the assertion. No pid plumbing, no timed renewal.
 *
 * Only idle sleep is inhibited (`-i` / `--what=idle`): the display may sleep, and lid-close / explicit sleep still work.
 */
import { OS } from '@lib/context-services';
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

export type SleepInhibitCommand = {
  readonly args: readonly string[];
  /** Absolute; the Tauri `shell:allow-spawn` scope `name` must equal it. */
  readonly command: string;
};

const CAFFEINATE: SleepInhibitCommand = { args: ['-i', '/bin/cat'], command: '/usr/bin/caffeinate' };

const SYSTEMD_INHIBIT: SleepInhibitCommand = {
  args: ['--what=idle', '--who=Agent Orchestrator', '--why=Agents are working', '--mode=block', '/bin/cat'],
  command: '/usr/bin/systemd-inhibit',
};

/** Idle-sleep inhibitor for `platform`, or undefined when the platform has none. */
export const sleepInhibitCommand = (platform: string): SleepInhibitCommand | undefined => {
  switch (platform) {
    case 'darwin':
      return CAFFEINATE;
    case 'linux':
      return SYSTEMD_INHIBIT;
    default:
      return undefined;
  }
};

/**
 * This Host's inhibitor, or undefined when unsupported: macOS always; Linux only when `systemd-inhibit` exists (Tauri
 * can only probe allowlisted dirs, so non-`/usr/bin` installs read as unsupported).
 */
export const keepAwakeCommand = Effect.fn('keepAwakeCommand')(function* () {
  const os = yield* OS;
  const fs = yield* FileSystem;
  const command = sleepInhibitCommand(os.platform());
  if (command === undefined || os.platform() === 'darwin') {
    return command;
  }
  const present = yield* fs.exists(command.command).pipe(Effect.orElseSucceed(() => false));
  return present ? command : undefined;
});

/**
 * Hold the inhibitor until the scope closes (which kills the child). Failures are logged and swallowed so keep-awake
 * never breaks a prompt turn; an unexpected exit is logged once and not respawned.
 */
export const holdKeepAwake = Effect.fn('holdKeepAwake')(
  function* (command: SleepInhibitCommand) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(ChildProcess.make(command.command, [...command.args], { stdin: 'pipe' }));
    yield* Effect.logInfo('Keep-awake hold acquired', command.command);
    yield* Effect.forkScoped(
      handle.exitCode.pipe(
        Effect.flatMap(exitCode => Effect.logWarning('Keep-awake hold exited unexpectedly', exitCode)),
        Effect.catch(error => Effect.logWarning('Keep-awake hold exited unexpectedly', error)),
      ),
    );
  },
  Effect.catch(error => Effect.logError('Keep-awake hold failed', error)),
  Effect.annotateLogs({ module: 'keepAwake' }),
);
