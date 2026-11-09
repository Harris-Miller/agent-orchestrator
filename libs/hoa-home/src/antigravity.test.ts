import { assert, describe, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { beforeEach } from 'vitest';

import {
  antigravityBrowserHelperScript,
  ensureAntigravityProviderBrowserHelper,
  ensureAntigravityProviderHome,
} from './antigravity.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const ROOT = '/home/operator/.hoa/providers/antigravity-acp';

describe('antigravity provider support files', () => {
  const store = new Map<string, MapFsEntry>();

  beforeEach(() => {
    store.clear();
  });

  layer(mapFsTestServices(store))(layeredIt => {
    layeredIt.effect('creates GEMINI_HOME under providers/antigravity-acp/home', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* ensureAntigravityProviderHome(), `${ROOT}/home`);
        assert.strictEqual(store.get(`${ROOT}/home`)?.kind, 'dir');
      }),
    );

    layeredIt.effect('writes the capture-only BROWSER helper beside runtime/ and current.json', () =>
      Effect.gen(function* () {
        const helperPath = yield* ensureAntigravityProviderBrowserHelper();
        assert.strictEqual(helperPath, `${ROOT}/browser-helper`);
        assert.deepStrictEqual(store.get(helperPath), { content: antigravityBrowserHelperScript, kind: 'file' });
      }),
    );
  });
});
