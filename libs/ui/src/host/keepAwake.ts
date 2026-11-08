/**
 * Keep-awake hold: an OS idle-sleep hold kept by a child process.
 *
 * No Host service: both Hosts already spawn real OS children of the Host process through `ChildProcessSpawner`
 * (Tauri plugin-shell; VS Code extension host), so the hold is a plain command. Swapping in a Host service later
 * (e.g. a native Windows `SetThreadExecutionState`) is contained to this module.
 *
 * Crash safety via stdin EOF: the hold command wraps `/bin/cat`, spawned with stdin piped and never written. Both Hosts
 * keep the pipe open for the child's life; if the Harness dies (even SIGKILL), `cat` reads EOF and exits, releasing
 * the assertion. No pid plumbing, no timed renewal.
 *
 * Only idle sleep is held off (`-i` / `--what=idle`): the display may sleep, and lid-close / explicit sleep still work.
 */
import { OS } from '@lib/context-services';
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

export type KeepAwakeHoldCommand = {
  readonly args: readonly string[];
  /** Absolute; the Tauri `shell:allow-spawn` scope `name` must equal it. */
  readonly command: string;
};

const MACOS_HOLD: KeepAwakeHoldCommand = { args: ['-i', '/bin/cat'], command: '/usr/bin/caffeinate' };

const LINUX_HOLD: KeepAwakeHoldCommand = {
  args: ['--what=idle', '--who=Agent Orchestrator', '--why=Agents are working', '--mode=block', '/bin/cat'],
  command: '/usr/bin/systemd-inhibit',
};

/** Per-platform Keep-awake hold; `probe` means the command may be absent and must be checked before use. */
const PLATFORM_HOLDS: Partial<Record<string, { readonly hold: KeepAwakeHoldCommand; readonly probe: boolean }>> = {
  darwin: { hold: MACOS_HOLD, probe: false },
  linux: { hold: LINUX_HOLD, probe: true },
};

/** Keep-awake hold command for `platform`, or undefined when the platform has none. */
export const keepAwakeHoldCommand = (platform: string): KeepAwakeHoldCommand | undefined =>
  PLATFORM_HOLDS[platform]?.hold;

/**
 * This Host's Keep-awake hold command, or undefined when unsupported: macOS always; Linux only when `systemd-inhibit` exists (Tauri
 * can only probe allowlisted dirs, so non-`/usr/bin` installs read as unsupported).
 */
export const hostKeepAwakeHoldCommand = Effect.fn('hostKeepAwakeHoldCommand')(function* () {
  const os = yield* OS;
  const fs = yield* FileSystem;
  const entry = PLATFORM_HOLDS[os.platform()];
  if (entry === undefined || !entry.probe) {
    return entry?.hold;
  }
  const present = yield* fs.exists(entry.hold.command).pipe(Effect.orElseSucceed(() => false));
  return present ? entry.hold : undefined;
});

/**
 * Hold the computer awake until the scope closes (which kills the child). Failures are logged and swallowed so keep-awake
 * never breaks a prompt turn; an unexpected exit is logged once and not respawned.
 */
export const holdKeepAwake = Effect.fn('holdKeepAwake')(
  function* (command: KeepAwakeHoldCommand) {
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
