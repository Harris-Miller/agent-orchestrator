/**
 * Vendor CLI auth check for launch prerequisites (after PATH resolve).
 */
import { OS } from '@lib/context-services';
import { Effect, Ref, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { isRecord } from '../isRecord.ts';

import { MissingLaunchPrerequisite } from './findExecutableOnPath.ts';

const AUTH_PROBE_TIMEOUT = '3 seconds' as const;
/** Wall-clock grace after exit so late stdout chunks land (Tauri queues; TestClock-safe). */
const POST_EXIT_STDOUT_DRAIN_MS = 100;

type AuthProbeLaunchTarget = 'claude-agent-acp' | 'codex-acp' | 'cursor-acp';

const executableName = (launchTarget: AuthProbeLaunchTarget): string => {
  switch (launchTarget) {
    case 'claude-agent-acp':
      return 'claude';
    case 'codex-acp':
      return 'codex';
    case 'cursor-acp':
      return 'cursor-agent';
  }
};

const notAuthenticatedMessage = (launchTarget: AuthProbeLaunchTarget): string => {
  switch (launchTarget) {
    case 'claude-agent-acp':
      return '`claude` is not authenticated — run `claude auth login`';
    case 'codex-acp':
      return '`codex` is not authenticated — run `codex login`';
    case 'cursor-acp':
      return '`cursor-agent` is not authenticated — run `cursor-agent login`';
  }
};

const couldNotVerifyMessage = (name: string): string => `Could not verify authentication for \`${name}\``;

const hasNonEmptyEnv = (env: Readonly<Record<string, string | undefined>>, key: string): boolean => {
  const value = env[key];
  return value !== undefined && value.length > 0;
};

const parseJsonBooleanField = (stdout: string, field: string): boolean | undefined => {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!isRecord(parsed)) {
      return undefined;
    }
    const value = parsed[field];
    return typeof value === 'boolean' ? value : undefined;
  } catch {
    return undefined;
  }
};

const mergeChunks = (chunks: readonly Uint8Array[]): string => {
  const totalLength = chunks.reduce((n, chunk) => n + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
};

/** Wall clock — `@effect/vitest` TestClock freezes `Effect.sleep`. */
const wallSleep = (ms: number): Effect.Effect<void> =>
  Effect.promise(
    () =>
      new Promise<void>(resolve => {
        setTimeout(resolve, ms);
      }),
  );

const collectStdoutAfterExit = Effect.fn('collectStdoutAfterExit')(function* (
  command: ReturnType<typeof ChildProcess.make>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  // Tauri ChildProcessSpawnerLive never ends stdout Queue on process close, so
  // spawner.string() hangs. Fork a collector, await exit, then drain briefly.
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const chunksRef = yield* Ref.make<readonly Uint8Array[]>([]);
      yield* Effect.forkScoped(
        handle.stdout.pipe(Stream.runForEach(chunk => Ref.update(chunksRef, chunks => [...chunks, chunk]))),
      );
      yield* handle.exitCode;
      yield* wallSleep(POST_EXIT_STDOUT_DRAIN_MS);
      return mergeChunks(yield* Ref.get(chunksRef));
    }),
  );
});

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
  // Spawn by shell-scope name (not absolute PATH path) — Tauri only allows configured cmds.
  const command = ChildProcess.make('claude', ['auth', 'status'], { extendEnv: true });
  const stdout = yield* collectStdoutAfterExit(command);

  const loggedIn = parseJsonBooleanField(stdout.trim(), 'loggedIn');
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

const runCursorAuthProbe = Effect.fn('runCursorAuthProbe')(function* () {
  const os = yield* OS;
  const env = os.env();
  if (hasNonEmptyEnv(env, 'CURSOR_API_KEY') || hasNonEmptyEnv(env, 'CURSOR_AUTH_TOKEN')) {
    return;
  }

  // Spawn by shell-scope name (not absolute PATH path) — Tauri only allows configured cmds.
  const command = ChildProcess.make('cursor-agent', ['status', '--format', 'json'], { extendEnv: true });
  const stdout = yield* collectStdoutAfterExit(command);

  const authenticated = parseJsonBooleanField(stdout.trim(), 'isAuthenticated');
  if (authenticated === undefined) {
    return yield* new MissingLaunchPrerequisite({
      executable: 'cursor-agent',
      message: couldNotVerifyMessage('cursor-agent'),
    });
  }
  if (!authenticated) {
    return yield* new MissingLaunchPrerequisite({
      executable: 'cursor-agent',
      message: notAuthenticatedMessage('cursor-acp'),
    });
  }
});

const authProbeFor = (launchTarget: AuthProbeLaunchTarget) => {
  switch (launchTarget) {
    case 'claude-agent-acp':
      return runClaudeAuthProbe();
    case 'codex-acp':
      return runCodexAuthProbe();
    case 'cursor-acp':
      return runCursorAuthProbe();
  }
};

/** After PATH resolves, verify the vendor CLI appears authenticated. */
export const requireVendorCliAuthenticated = Effect.fn('requireVendorCliAuthenticated')(
  function* (launchTarget: AuthProbeLaunchTarget, executablePath: string) {
    const name = executableName(launchTarget);
    yield* Effect.logDebug('Probing vendor CLI auth', launchTarget, executablePath);

    return yield* authProbeFor(launchTarget).pipe(
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
