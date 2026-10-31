import { assert, describe, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { beforeEach } from 'vitest';

import { LaunchTargetSchema } from './LaunchTarget.ts';
import {
  antigravityProviderBrowserHelperPath,
  antigravityProviderHomeDir,
  providerCurrentJsonPath,
  providerRuntimeDir,
} from './providers.ts';
import { beginRuntimeAttempt, completeRuntimeAttempt, setActiveRuntime } from './providerRuntimeCatalog.ts';
import {
  ProviderRuntimeDocumentMalformed,
  readProviderRuntimeState,
  writeProviderRuntimeDocument,
} from './providerRuntimeState.ts';
import { emptyProviderRuntimeDocument } from './ProviderRuntimeDocument.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const ROOT = '/home/operator/.ao/providers';
const claude = LaunchTargetSchema.make('claude-agent-acp');

describe('provider paths and runtime state', () => {
  const store = new Map<string, MapFsEntry>();

  beforeEach(() => {
    store.clear();
  });

  layer(mapFsTestServices(store))(layeredIt => {
    layeredIt.effect('resolves runtime, current.json and Antigravity paths under providers/', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* providerRuntimeDir(claude, '1.2.3'), `${ROOT}/claude-agent-acp/runtime/1.2.3`);
        assert.strictEqual(yield* providerCurrentJsonPath(claude), `${ROOT}/claude-agent-acp/current.json`);
        assert.strictEqual(yield* antigravityProviderHomeDir(), `${ROOT}/antigravity-acp/home`);
        assert.strictEqual(yield* antigravityProviderBrowserHelperPath(), `${ROOT}/antigravity-acp/browser-helper`);
      }),
    );

    layeredIt.effect('missing current.json is Missing, not an error', () =>
      Effect.gen(function* () {
        assert.deepStrictEqual(yield* readProviderRuntimeState(claude), { _tag: 'Missing' });
      }),
    );

    layeredIt.effect('malformed current.json fails instead of reading as missing', () =>
      Effect.gen(function* () {
        store.set(`${ROOT}/claude-agent-acp/current.json`, { content: '{not json', kind: 'file' });
        const error = yield* readProviderRuntimeState(claude).pipe(Effect.flip);
        assert.instanceOf(error, ProviderRuntimeDocumentMalformed);
      }),
    );

    layeredIt.effect('valid current.json is Present', () =>
      Effect.gen(function* () {
        store.set(`${ROOT}/claude-agent-acp/current.json`, {
          content: JSON.stringify({ schemaVersion: 1, active: null, catalog: [] }),
          kind: 'file',
        });
        const state = yield* readProviderRuntimeState(claude);
        assert.strictEqual(state._tag, 'Present');
      }),
    );

    layeredIt.effect('written document reads back and publishes through the atomic host op', () =>
      Effect.gen(function* () {
        let doc = beginRuntimeAttempt(emptyProviderRuntimeDocument, {
          _tag: 'npm',
          package: '@agentclientprotocol/claude-agent-acp',
          version: '1.0.0',
        });
        doc = setActiveRuntime(completeRuntimeAttempt(doc, '1.0.0'), '1.0.0');
        yield* writeProviderRuntimeDocument(claude, doc);
        const state = yield* readProviderRuntimeState(claude);
        assert.deepStrictEqual(state, { _tag: 'Present', document: doc });
      }),
    );
  });
});
