import { assert, describe, it, layer } from '@effect/vitest';
import { Effect, Fiber, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { beforeEach } from 'vitest';

import {
  adapterDirPath,
  adapterHistoryLockPath,
  adapterHistoryPath,
  emptyAdapterHistory,
  LaunchTargetSchema,
  readAdapterHistory,
  withAdapterHistoryLock,
  writeAdapterHistory,
} from './index.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const HOMEDIR = '/home/operator';
const HOME = `${HOMEDIR}/.hoa`;
const LAUNCH_TARGET = Schema.decodeSync(LaunchTargetSchema)('antigravity-acp');
const ADAPTER_DIR = `${HOME}/adapters/${LAUNCH_TARGET}`;
const HISTORY = `${ADAPTER_DIR}/history.json`;
const LOCK = `${ADAPTER_DIR}/history.lock`;

describe('LaunchTargetSchema', () => {
  it('accepts kebab-case launch targets', () => {
    assert.strictEqual(Schema.decodeSync(LaunchTargetSchema)('antigravity-acp'), 'antigravity-acp');
  });

  it('rejects non-kebab launch targets', () => {
    for (const bad of ['../x', 'a/b', '', 'GeminiAcp', 'gemini_acp']) {
      assert.throws(() => Schema.decodeSync(LaunchTargetSchema)(bad));
    }
  });
});

describe('adapter history', () => {
  const store = new Map<string, MapFsEntry>();

  beforeEach(() => {
    store.clear();
  });

  layer(mapFsTestServices(store))(layeredIt => {
    layeredIt.effect('path helpers nest under adapters/launchTarget', () =>
      Effect.gen(function* () {
        const dir = yield* adapterDirPath(LAUNCH_TARGET);
        const history = yield* adapterHistoryPath(LAUNCH_TARGET);
        const lock = yield* adapterHistoryLockPath(LAUNCH_TARGET);
        assert.strictEqual(dir, ADAPTER_DIR);
        assert.strictEqual(history, HISTORY);
        assert.strictEqual(lock, LOCK);
      }),
    );

    layeredIt.effect('readAdapterHistory returns empty when missing and creates no files', () =>
      Effect.gen(function* () {
        const doc = yield* readAdapterHistory(LAUNCH_TARGET);
        assert.deepStrictEqual(doc, emptyAdapterHistory);
        assert.isFalse(store.has(HISTORY));
        assert.isFalse(store.has(ADAPTER_DIR));
        assert.isFalse(store.has(HOME));
      }),
    );

    layeredIt.effect('readAdapterHistory returns empty for corrupt JSON without rewriting', () =>
      Effect.gen(function* () {
        store.set(ADAPTER_DIR, { kind: 'dir' });
        store.set(HOME, { kind: 'dir' });
        store.set(HISTORY, { content: '{not-json', kind: 'file' });
        const doc = yield* readAdapterHistory(LAUNCH_TARGET);
        assert.deepStrictEqual(doc, emptyAdapterHistory);
        const entry = store.get(HISTORY);
        assert.isTrue(entry?.kind === 'file');
        if (entry?.kind === 'file') {
          assert.strictEqual(entry.content, '{not-json');
        }
      }),
    );

    layeredIt.effect('writeAdapterHistory then readAdapterHistory round-trips with trailing newline', () =>
      Effect.gen(function* () {
        const written = {
          sessions: [
            {
              cwd: '/work/repo',
              sessionId: 'sess-1',
              title: 'First',
              updatedAt: '2026-10-04T12:00:00.000Z',
            },
          ],
        };
        yield* writeAdapterHistory(LAUNCH_TARGET, written);
        const doc = yield* readAdapterHistory(LAUNCH_TARGET);
        assert.deepStrictEqual(doc, written);
        const onDisk = store.get(HISTORY);
        assert.isTrue(onDisk?.kind === 'file');
        if (onDisk?.kind === 'file') {
          assert.isTrue(onDisk.content.endsWith('\n'));
        }
      }),
    );

    layeredIt.effect('withAdapterHistoryLock waits while lock file exists then proceeds', () =>
      Effect.gen(function* () {
        store.set(ADAPTER_DIR, { kind: 'dir' });
        store.set(HOME, { kind: 'dir' });
        store.set(LOCK, { content: '', kind: 'file' });
        const fiber = yield* withAdapterHistoryLock(LAUNCH_TARGET, Effect.succeed('ok')).pipe(Effect.forkChild);

        yield* TestClock.adjust('50 millis');
        assert.isUndefined(fiber.pollUnsafe());

        store.delete(LOCK);
        yield* TestClock.adjust('50 millis');
        assert.strictEqual(yield* Fiber.join(fiber), 'ok');
        assert.isFalse(store.has(LOCK));
      }),
    );

    layeredIt.effect('withAdapterHistoryLock removes lock after success and after inner failure', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* withAdapterHistoryLock(LAUNCH_TARGET, Effect.succeed(42)), 42);
        assert.isFalse(store.has(LOCK));

        const exit = yield* withAdapterHistoryLock(LAUNCH_TARGET, Effect.fail('boom')).pipe(Effect.exit);
        assert.isTrue(exit._tag === 'Failure');
        assert.isFalse(store.has(LOCK));
      }),
    );
  });
});
