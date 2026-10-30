import { assert, describe, layer } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { beforeEach } from 'vitest';

import { harnessDirPath, LaunchTargetSchema, readSessionIndex, sessionIndexPath, writeSessionIndex } from './index.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const target = Schema.decodeSync(LaunchTargetSchema)('codex-acp');
const store = new Map<string, MapFsEntry>();
const file = '/home/operator/.ao/harness/codex-acp/session-index.json';

describe('session index', () => {
  beforeEach(() => {
    store.clear();
  });
  layer(mapFsTestServices(store))(testIt => {
    testIt.effect('uses harness path and reads empty when missing or corrupt', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* harnessDirPath(target), '/home/operator/.ao/harness/codex-acp');
        assert.strictEqual(yield* sessionIndexPath(target), file);
        assert.deepStrictEqual(yield* readSessionIndex(target), { sessions: [] });
        store.set('/home/operator/.ao/harness/codex-acp', { kind: 'dir' });
        store.set(file, { kind: 'file', content: '{bad' });
        assert.deepStrictEqual(yield* readSessionIndex(target), { sessions: [] });
      }),
    );

    testIt.effect('round-trips optional undefined title without writing updatedAt', () =>
      Effect.gen(function* () {
        yield* writeSessionIndex(target, { sessions: [{ cwd: '/work', sessionId: 's1', title: undefined }] });
        assert.deepStrictEqual(yield* readSessionIndex(target), { sessions: [{ cwd: '/work', sessionId: 's1' }] });
        const written = store.get(file);
        assert.isTrue(written?.kind === 'file');
        if (written?.kind === 'file') {
          assert.isTrue(written.content.endsWith('\n'));
          assert.notInclude(written.content, 'updatedAt');
        }
      }),
    );
  });
});
