/**
 * Vendor CLI auth check for launch prerequisites (after PATH resolve).
 */
import { Effect } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import { isRecord } from '../utils.ts';

import { MissingLaunchPrerequisite } from './findExecutableOnPath.ts';

const AUTH_PROBE_TIMEOUT = '3 seconds' as const;

type AuthProbeLaunchTarget = 'claude-agent-acp' | 'codex-acp';

const executableName = (launchTarget: AuthProbeLaunchTarget): string => {
  switch (launchTarget) {
    case 'claude-agent-acp':
      return 'claude';
    case 'codex-acp':
      return 'codex';
  }
};

const notAuthenticatedMessage = (launchTarget: AuthProbeLaunchTarget): string => {
  switch (launchTarget) {
    case 'claude-agent-acp':
      return '`claude` is not authenticated — run `claude auth login`';
    case 'codex-acp':
      return '`codex` is not authenticated — run `codex login`';
  }
};

const couldNotVerifyMessage = (name: string): string => `Could not verify authentication for \`${name}\``;

const parseClaudeLoggedIn = (stdout: string): boolean | undefined => {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!isRecord(parsed) || typeof parsed.loggedIn !== 'boolean') {
      return undefined;
    }
    return parsed.loggedIn;
  } catch {
    return undefined;
  }
};

const runCodexAuthProbe = Effect.fn('runCodexAuthProbe')(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  // Spawn by shell-scope name (not absolute PATH path) — Tauri only allows configured cmds.
  const command = ChildProcess.make('codex', ['login', 'status'], { extendEnv: true });
  const exitCode = yield* spawner.exitCode(command);
  if (exitCode !== 0) {
    return yield* new MissingLaunchPrerequisite({
      executable: 'codex',
      message: notAuthenticatedMessage('codex-acp'),
    });
  }
});

const runClaudeAuthProbe = Effect.fn('runClaudeAuthProbe')(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  // Spawn by shell-scope name (not absolute PATH path) — Tauri only allows configured cmds.
  const command = ChildProcess.make('claude', ['auth', 'status'], { extendEnv: true });
  const stdout = yield* spawner.string(command);
  const loggedIn = parseClaudeLoggedIn(stdout.trim());
  if (loggedIn === undefined) {
    return yield* new MissingLaunchPrerequisite({
      executable: 'claude',
      message: couldNotVerifyMessage('claude'),
    });
  }
  if (!loggedIn) {
    return yield* new MissingLaunchPrerequisite({
      executable: 'claude',
      message: notAuthenticatedMessage('claude-agent-acp'),
    });
  }
});

/** After PATH resolves, verify the vendor CLI appears authenticated. */
export const requireVendorCliAuthenticated = Effect.fn('requireVendorCliAuthenticated')(
  function* (launchTarget: AuthProbeLaunchTarget, executablePath: string) {
    const name = executableName(launchTarget);
    yield* Effect.logDebug('Probing vendor CLI auth', launchTarget, executablePath);

    const probe = launchTarget === 'codex-acp' ? runCodexAuthProbe() : runClaudeAuthProbe();

    return yield* probe.pipe(
      Effect.timeout(AUTH_PROBE_TIMEOUT),
      Effect.mapError(error => {
        if (error._tag === 'MissingLaunchPrerequisite') {
          return error;
        }
        return new MissingLaunchPrerequisite({
          executable: name,
          message: couldNotVerifyMessage(name),
        });
      }),
    );
  },
  Effect.annotateLogs({ module: 'vendorCliAuth' }),
);
