import type { AcpAgentConnection } from '@libs/effect-acp';
import { Effect, Scope } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

/** Command for the Gemini child: Vendor CLI `gemini --acp` on PATH. */
export const GEMINI_CHILD_COMMAND = ChildProcess.make('gemini', ['--acp'], pipedSpawnOptions);

/** Narrow Gemini child surface used by adapter Agent handlers (real connection or test fake). */
export type GeminiChild = {
  readonly agent: Pick<
    AcpAgentConnection['agent'],
    | 'authenticate'
    | 'initialize'
    | 'logout'
    | 'session/load'
    | 'session/new'
    | 'session/prompt'
    | 'session/set_config_option'
    | 'session/set_mode'
  >;
  readonly notify: AcpAgentConnection['notify'];
};

export type EnsureGeminiChild = Effect.Effect<GeminiChild, unknown>;

/**
 * Memoize a connect Effect into the current Layer Scope (lazy on first run).
 * Caller must already provide ChildProcessSpawner / FileSystem / Path on `connect`.
 */
export const makeLazyEnsureGeminiChild = Effect.fn('makeLazyEnsureGeminiChild')(function* (
  connect: Effect.Effect<GeminiChild, unknown, Scope.Scope>,
) {
  const scope = yield* Scope.Scope;
  return yield* Effect.cached(Scope.provide(scope)(connect));
});
