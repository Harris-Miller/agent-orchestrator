/** Run a child process to completion, capturing stdout, stderr and exit code (argv only; no shell). */
import { Effect, Ref, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** Wall-clock grace after exit so late chunks land (Tauri queues never end on process close). */
const POST_EXIT_DRAIN_MS = 100;

export type CapturedProcess = {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
};

const wallSleep = (ms: number): Effect.Effect<void> =>
  Effect.promise(
    () =>
      new Promise<void>(resolve => {
        setTimeout(resolve, ms);
      }),
  );

const decodeChunks = (chunks: readonly Uint8Array[]): string => {
  const merged = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
};

/** Fails with the spawner's `PlatformError` on spawn failure; non-zero exit is reported, not failed. */
export const runCapturedProcess = Effect.fn('runCapturedProcess')(function* (
  command: string,
  args: readonly string[],
  options?: { readonly cwd?: string },
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, [...args], { cwd: options?.cwd, extendEnv: true }),
      );
      const stdoutRef = yield* Ref.make<readonly Uint8Array[]>([]);
      const stderrRef = yield* Ref.make<readonly Uint8Array[]>([]);
      yield* Effect.forkScoped(
        handle.stdout.pipe(Stream.runForEach(chunk => Ref.update(stdoutRef, chunks => [...chunks, chunk]))),
      );
      yield* Effect.forkScoped(
        handle.stderr.pipe(Stream.runForEach(chunk => Ref.update(stderrRef, chunks => [...chunks, chunk]))),
      );
      const exitCode = yield* handle.exitCode;
      yield* wallSleep(POST_EXIT_DRAIN_MS);
      return {
        exitCode,
        stderr: decodeChunks(yield* Ref.get(stderrRef)),
        stdout: decodeChunks(yield* Ref.get(stdoutRef)),
      } satisfies CapturedProcess;
    }),
  );
});
