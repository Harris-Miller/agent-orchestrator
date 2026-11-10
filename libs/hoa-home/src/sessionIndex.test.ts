import { assert, describe, layer } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { beforeEach } from 'vitest';

import { LaunchTargetSchema, providerDir, readSessionIndex, sessionIndexPath, writeSessionIndex } from './index.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const target = Schema.decodeSync(LaunchTargetSchema)('codex-acp');
const store = new Map<string, MapFsEntry>();
const file = '/home/operator/.hoa/providers/codex-acp/session-index.json';

describe('session index', () => {
  beforeEach(() => {
    store.clear();
  });
  layer(mapFsTestServices(store))(testIt => {
    testIt.effect('lives in the provider directory and reads empty when missing or corrupt', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* providerDir(target), '/home/operator/.hoa/providers/codex-acp');
        assert.strictEqual(yield* sessionIndexPath(target), file);
        assert.deepStrictEqual(yield* readSessionIndex(target), { sessions: [] });
        store.set('/home/operator/.hoa/providers/codex-acp', { kind: 'dir' });
        store.set(file, { kind: 'file', content: '{bad' });
        assert.deepStrictEqual(yield* readSessionIndex(target), { sessions: [] });
      }),
    );

    testIt.effect('round-trips complete list rows, including updatedAt and _meta', () =>
      Effect.gen(function* () {
        const document = {
          sessions: [
            {
              _meta: { provider: { archived: false } },
              cwd: '/work',
              sessionId: 's1',
              title: 'Work',
              updatedAt: '2026-10-30T12:00:00.000Z',
            },
          ],
        };
        yield* writeSessionIndex(target, document);
        assert.deepStrictEqual(yield* readSessionIndex(target), document);
        const written = store.get(file);
        assert.isTrue(written?.kind === 'file');
        if (written?.kind === 'file') {
          assert.isTrue(written.content.endsWith('\n'));
          assert.include(written.content, 'updatedAt');
          assert.include(written.content, '"_meta"');
          assert.notInclude(written.content, 'unavailable');
        }
      }),
    );
  });
});
