/**
 * Keep-awake controller driven through Harness application state (Backend harness snapshots + the Keep awake User
 * setting) against a recording ChildProcessSpawner. TestClock drives the grace period.
 */
import { OS } from '@lib/context-services';
import { assert, describe, it } from '@effect/vitest';
import type { Duration } from 'effect';
import { Effect, Fiber, Layer, Queue, Sink, Stream } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';
import { TestClock } from 'effect/testing';

import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { harness, permission, session } from '../host/harnessSnapshot.testing.ts';
import { endClientRequest, endPromptTurn, reconcileConnectionLost } from '../host/harnessStateTransitions.ts';
import { runKeepAwake } from './keepAwake.atoms.ts';
import type { KeepAwakeInput } from './keepAwake.atoms.ts';

type SpawnEvent = 'kill' | 'spawn';

const recordingSpawner = (events: SpawnEvent[], options: { readonly fail?: boolean } = {}) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() =>
      options.fail === true
        ? Effect.fail(
            PlatformError.systemError({
              _tag: 'NotFound',
              description: 'not found',
              method: 'spawn',
              module: 'ChildProcess',
            }),
          )
        : Effect.gen(function* () {
            events.push('spawn');
            yield* Effect.addFinalizer(() => Effect.sync(() => events.push('kill')));
            return ChildProcessSpawner.makeHandle({
              all: Stream.empty,
              exitCode: Effect.never,
              getInputFd: () => Sink.drain,
              getOutputFd: () => Stream.empty,
              isRunning: Effect.succeed(true),
              kill: () => Effect.void,
              pid: ChildProcessSpawner.ProcessId(1),
              stderr: Stream.empty,
              stdin: Sink.drain,
              stdout: Stream.empty,
              unref: Effect.succeed(Effect.void),
            });
          }),
    ),
  );

const hostLayer = (
  events: SpawnEvent[],
  options: { readonly fail?: boolean; readonly platform?: string; readonly systemdInhibit?: boolean } = {},
) =>
  Layer.mergeAll(
    recordingSpawner(events, options),
    Layer.succeed(OS, {
      arch: () => 'arm64',
      cwd: () => '/home/operator',
      env: () => ({}),
      homedir: () => '/home/operator',
      platform: () => options.platform ?? 'darwin',
    }),
    layerNoop({ exists: () => Effect.succeed(options.systemdInhibit === true) }),
  );

const idle = harness([session('a'), session('b')]);
const prompting = harness([session('a', { pendingClientRequest: 'prompt' }), session('b')]);

const settle = Effect.repeat(Effect.yieldNow, { times: 50 });

const advance = (duration: Duration.Input) => TestClock.adjust(duration).pipe(Effect.andThen(settle));

/** Run the controller over a pushable input stream; `push` lets the controller react before returning. */
const start = (layer: ReturnType<typeof hostLayer>) =>
  Effect.gen(function* () {
    const inputs = yield* Queue.unbounded<KeepAwakeInput>();
    const fiber = yield* runKeepAwake(Stream.fromQueue(inputs)).pipe(Effect.provide(layer), Effect.forkScoped);
    const push = (snapshots: readonly BackendHarnessSnapshot[], enabled = true) =>
      Queue.offer(inputs, { enabled, snapshots }).pipe(Effect.andThen(settle));
    return { fiber, push };
  });

describe('runKeepAwake', () => {
  it.effect('holds while a Prompt turn runs and releases 30s after it ends', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const { push } = yield* start(hostLayer(events));
      yield* push([idle]);
      assert.deepStrictEqual(events, []);
      yield* push([prompting]);
      assert.deepStrictEqual(events, ['spawn']);
      yield* push([endClientRequest(prompting, 'a')]);
      yield* advance('29 seconds');
      assert.deepStrictEqual(events, ['spawn']);
      yield* advance('1 second');
      assert.deepStrictEqual(events, ['spawn', 'kill']);
    }),
  );

  it.effect('keeps one hold across overlapping turns on several launch targets', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const { push } = yield* start(hostLayer(events));
      yield* push([prompting, idle]);
      yield* push([prompting, harness([session('c', { pendingClientRequest: 'prompt' })])]);
      yield* push([endClientRequest(prompting, 'a'), harness([session('c', { pendingClientRequest: 'prompt' })])]);
      yield* advance('1 minute');
      assert.deepStrictEqual(events, ['spawn']);
      yield* push([endClientRequest(prompting, 'a'), idle]);
      yield* advance('30 seconds');
      assert.deepStrictEqual(events, ['spawn', 'kill']);
    }),
  );

  it.effect('treats a cancelled turn as ended', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const { push } = yield* start(hostLayer(events));
      yield* push([prompting]);
      yield* push([harness([session('a', { pendingClientRequest: 'prompt', promptCancelRequested: true })])]);
      assert.deepStrictEqual(events, ['spawn']);
      yield* push([endClientRequest(prompting, 'a')]);
      yield* advance('30 seconds');
      assert.deepStrictEqual(events, ['spawn', 'kill']);
    }),
  );

  // `sendPromptTurn` runs `endPromptTurn` in `onExit`, so success and RPC error reach the controller identically.
  it.effect('treats endPromptTurn (success or RPC error) as the end of the turn', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const { push } = yield* start(hostLayer(events));
      yield* push([prompting]);
      yield* push([endPromptTurn(prompting, 'a', 'turn', 0)]);
      yield* advance('30 seconds');
      assert.deepStrictEqual(events, ['spawn', 'kill']);
    }),
  );

  // Stop / Restart / retry all reconcile through Connection lost (`stopAndReconcile`, `onConnectionLost`).
  it.effect('treats Connection lost (incl. Restart / retry) as the end of every turn', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const { push } = yield* start(hostLayer(events));
      yield* push([prompting]);
      yield* push([reconcileConnectionLost(prompting)]);
      yield* advance('30 seconds');
      assert.deepStrictEqual(events, ['spawn', 'kill']);
    }),
  );

  it.effect('a new turn within the grace period keeps the same hold', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const { push } = yield* start(hostLayer(events));
      yield* push([prompting]);
      yield* push([idle]);
      yield* advance('20 seconds');
      yield* push([prompting]);
      yield* advance('1 minute');
      assert.deepStrictEqual(events, ['spawn']);
    }),
  );

  it.effect('releases while blocked on a Pending permission and re-acquires once answered', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const { push } = yield* start(hostLayer(events));
      yield* push([prompting]);
      yield* push([harness([session('a', { pendingClientRequest: 'prompt', pendingPermission: permission('a') })])]);
      yield* advance('30 seconds');
      assert.deepStrictEqual(events, ['spawn', 'kill']);
      yield* push([prompting]);
      assert.deepStrictEqual(events, ['spawn', 'kill', 'spawn']);
    }),
  );

  it.effect('follows the Keep awake setting mid-turn without a grace period', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const { push } = yield* start(hostLayer(events));
      yield* push([prompting]);
      yield* push([prompting], false);
      assert.deepStrictEqual(events, ['spawn', 'kill']);
      yield* push([prompting], true);
      assert.deepStrictEqual(events, ['spawn', 'kill', 'spawn']);
    }),
  );

  it.effect('never spawns on an unsupported platform', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const windows = yield* start(hostLayer(events, { platform: 'win32' }));
      yield* windows.push([prompting]);
      const linux = yield* start(hostLayer(events, { platform: 'linux', systemdInhibit: false }));
      yield* linux.push([prompting]);
      assert.deepStrictEqual(events, []);
    }),
  );

  it.effect('holds on Linux when systemd-inhibit exists', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const { push } = yield* start(hostLayer(events, { platform: 'linux', systemdInhibit: true }));
      yield* push([prompting]);
      assert.deepStrictEqual(events, ['spawn']);
    }),
  );

  it.effect('swallows a spawn failure and keeps running', () =>
    Effect.gen(function* () {
      const events: SpawnEvent[] = [];
      const { fiber, push } = yield* start(hostLayer(events, { fail: true }));
      yield* push([prompting]);
      yield* push([idle]);
      yield* advance('30 seconds');
      assert.isUndefined(fiber.pollUnsafe());
      yield* Fiber.interrupt(fiber);
    }),
  );
});
