import { assert, describe, layer } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { invoke } from '@tauri-apps/api/core';
import { Effect, Layer, Option, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { beforeEach, vi } from 'vitest';

import { ChildProcessSpawnerLive } from '../ChildProcessSpawnerLive.ts';

const writes: number[][] = [];
const kills: number[] = [];

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  writes.length = 0;
  kills.length = 0;
  mockedInvoke.mockClear();
  mockedInvoke.mockResolvedValue(undefined);
});

vi.mock('@tauri-apps/plugin-shell', () => {
  type Listener = (arg: unknown) => void;

  class MockEmitter {
    readonly listeners = new Map<string, Listener[]>();

    emit(event: string, arg: unknown): void {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(arg);
      }
    }

    on(event: string, listener: Listener): this {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
      return this;
    }
  }

  class MockChild {
    readonly pid: number;

    constructor(pid: number) {
      this.pid = pid;
    }

    async kill(): Promise<void> {
      kills.push(this.pid);
      await Promise.resolve();
    }

    async write(data: number[]): Promise<void> {
      writes.push(data);
      await Promise.resolve();
    }
  }

  class MockCommand extends MockEmitter {
    readonly stderr = new MockEmitter();
    readonly stdout = new MockEmitter();

    static create(_program: string, _args: string[] = []): MockCommand {
      return new MockCommand();
    }

    async spawn(): Promise<MockChild> {
      setTimeout(() => {
        // Match Tauri IPC: raw encoding delivers number[], not Uint8Array.
        this.stdout.emit('data', Array.from(new TextEncoder().encode('hello\n')));
        this.emit('close', { code: 0, signal: null });
      }, 10);
      return await Promise.resolve(new MockChild(99));
    }
  }

  return { Command: MockCommand };
});

describe('ChildProcessSpawnerLive', () => {
  const OsTest = Layer.succeed(OS, {
    cwd: () => '/tmp',
    env: () => ({ CURSOR_API_KEY: 'test-key', PATH: '/usr/bin' }),
    homedir: () => '/home/operator',
    platform: () => 'linux',
  });
  const SpawnerTestLive = ChildProcessSpawnerLive.pipe(Layer.provide(OsTest));

  layer(SpawnerTestLive)(it => {
    it.effect('spawns, reads one stdout chunk, and observes exit code', () =>
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const handle = yield* spawner.spawn(ChildProcess.make('agent', ['acp'], { cwd: '/tmp' }));
        assert.strictEqual(handle.pid, 99);
        const first = yield* Stream.runHead(handle.stdout);
        assert.isTrue(Option.isSome(first));
        assert.strictEqual(new TextDecoder().decode(Option.getOrThrow(first)), 'hello\n');
        assert.strictEqual(yield* handle.exitCode, 0);
      }),
    );

    it.effect('stdin writes bytes to the Tauri child', () =>
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const handle = yield* spawner.spawn(ChildProcess.make('git', ['status']));
        yield* Stream.run(Stream.make(new TextEncoder().encode('ping')), handle.stdin);
        assert.deepStrictEqual(writes[0], Array.from(new TextEncoder().encode('ping')));
        yield* handle.kill();
        assert.deepStrictEqual(kills, [99]);
      }),
    );

    it.effect('tracks spawned pid with the host so reload can reap orphans', () =>
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const handle = yield* spawner.spawn(ChildProcess.make('agent', ['acp'], { cwd: '/tmp' }));
        assert.strictEqual(handle.pid, 99);
        assert.isTrue(
          mockedInvoke.mock.calls.some(
            ([command, args]) => command === 'track_child_process' && (args as { pid: number }).pid === 99,
          ),
        );

        yield* handle.kill();
        assert.isTrue(
          mockedInvoke.mock.calls.some(
            ([command, args]) => command === 'untrack_child_process' && (args as { pid: number }).pid === 99,
          ),
        );
      }),
    );
  });
});
