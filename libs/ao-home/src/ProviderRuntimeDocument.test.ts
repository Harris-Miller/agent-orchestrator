import { assert, describe, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';

import {
  beginRuntimeAttempt,
  cleanupTargets,
  completeRuntimeAttempt,
  failRuntimeAttempt,
  markRuntimePendingDelete,
  removeRuntimeEntry,
  setActiveRuntime,
  supersededRuntimes,
} from './providerRuntimeCatalog.ts';
import { emptyProviderRuntimeDocument, ProviderRuntimeDocumentJsonString } from './ProviderRuntimeDocument.ts';
import type { ProviderDistribution } from './ProviderRuntimeDocument.ts';

const npm = (version: string): ProviderDistribution => ({ _tag: 'npm', package: '@scope/pkg', version });

const decode = Schema.decodeUnknownEffect(ProviderRuntimeDocumentJsonString);

describe('ProviderRuntimeDocument schema', () => {
  it.effect('accepts an active reference pointing at a completed entry', () =>
    Effect.gen(function* () {
      const doc = yield* decode(
        JSON.stringify({
          schemaVersion: 1,
          active: { version: '1.0.0', dir: 'runtime/1.0.0' },
          catalog: [
            { version: '1.0.0', dir: 'runtime/1.0.0', distribution: npm('1.0.0'), state: { _tag: 'completed' } },
          ],
        }),
      );
      assert.strictEqual(doc.active?.version, '1.0.0');
    }),
  );

  it.effect('rejects directories escaping the provider root and inconsistent version/dir pairs', () =>
    Effect.gen(function* () {
      const bad = (dir: string, version = '1.0.0') =>
        decode(
          JSON.stringify({
            schemaVersion: 1,
            active: null,
            catalog: [{ version, dir, distribution: npm(version), state: { _tag: 'completed' } }],
          }),
        ).pipe(Effect.flip);
      yield* bad('../outside');
      yield* bad('runtime/2.0.0');
      yield* bad('/abs/runtime/1.0.0');
      yield* bad('runtime/../x', '../x');
    }),
  );

  it.effect('rejects an active reference to a missing or incomplete entry', () =>
    Effect.gen(function* () {
      const missing = yield* decode(
        JSON.stringify({ schemaVersion: 1, active: { version: '1.0.0', dir: 'runtime/1.0.0' }, catalog: [] }),
      ).pipe(Effect.flip);
      assert.include(String(missing), 'not a completed catalog entry');
      const downloading = yield* decode(
        JSON.stringify({
          schemaVersion: 1,
          active: { version: '1.0.0', dir: 'runtime/1.0.0' },
          catalog: [
            { version: '1.0.0', dir: 'runtime/1.0.0', distribution: npm('1.0.0'), state: { _tag: 'downloading' } },
          ],
        }),
      ).pipe(Effect.flip);
      assert.include(String(downloading), 'not a completed catalog entry');
    }),
  );
});

describe('provider runtime catalog transitions', () => {
  it('records a downloading attempt before it can complete', () => {
    const recorded = beginRuntimeAttempt(emptyProviderRuntimeDocument, npm('1.0.0'));
    assert.deepStrictEqual(
      recorded.catalog.map(entry => [entry.version, entry.state._tag]),
      [['1.0.0', 'downloading']],
    );
    assert.strictEqual(recorded.catalog[0]?.dir, 'runtime/1.0.0');
    assert.isNull(recorded.active);
  });

  it('first completion can activate; later completions leave active unchanged', () => {
    let doc = beginRuntimeAttempt(emptyProviderRuntimeDocument, npm('1.0.0'));
    doc = completeRuntimeAttempt(doc, '1.0.0');
    doc = setActiveRuntime(doc, '1.0.0');
    doc = completeRuntimeAttempt(beginRuntimeAttempt(doc, npm('2.0.0')), '2.0.0');
    assert.strictEqual(doc.active?.version, '1.0.0');
    assert.deepStrictEqual(
      supersededRuntimes(doc).map(entry => entry.version),
      ['2.0.0'],
    );
  });

  it('only completed entries can be activated', () => {
    const doc = beginRuntimeAttempt(emptyProviderRuntimeDocument, npm('1.0.0'));
    assert.throws(() => setActiveRuntime(doc, '1.0.0'));
  });

  it('cleanup targets are incomplete, failed and pending-delete entries, never the active one', () => {
    let doc = completeRuntimeAttempt(beginRuntimeAttempt(emptyProviderRuntimeDocument, npm('1.0.0')), '1.0.0');
    doc = setActiveRuntime(doc, '1.0.0');
    doc = beginRuntimeAttempt(doc, npm('2.0.0'));
    doc = failRuntimeAttempt(beginRuntimeAttempt(doc, npm('3.0.0')), '3.0.0', 'exit 1');
    doc = completeRuntimeAttempt(beginRuntimeAttempt(doc, npm('4.0.0')), '4.0.0');
    doc = markRuntimePendingDelete(doc, '4.0.0', 'EBUSY');
    doc = completeRuntimeAttempt(beginRuntimeAttempt(doc, npm('5.0.0')), '5.0.0');
    assert.deepStrictEqual(
      cleanupTargets(doc).map(entry => entry.version),
      ['2.0.0', '3.0.0', '4.0.0'],
    );
  });

  it('removing a cleaned entry drops it from the catalog; the active entry cannot be removed', () => {
    let doc = completeRuntimeAttempt(beginRuntimeAttempt(emptyProviderRuntimeDocument, npm('1.0.0')), '1.0.0');
    doc = setActiveRuntime(doc, '1.0.0');
    doc = failRuntimeAttempt(beginRuntimeAttempt(doc, npm('2.0.0')), '2.0.0', 'boom');
    doc = removeRuntimeEntry(doc, '2.0.0');
    assert.deepStrictEqual(
      doc.catalog.map(entry => entry.version),
      ['1.0.0'],
    );
    assert.throws(() => removeRuntimeEntry(doc, '1.0.0'));
  });

  it('a retried version replaces its failed entry but never a completed one', () => {
    let doc = failRuntimeAttempt(beginRuntimeAttempt(emptyProviderRuntimeDocument, npm('1.0.0')), '1.0.0', 'boom');
    doc = beginRuntimeAttempt(doc, npm('1.0.0'));
    assert.strictEqual(doc.catalog[0]?.state._tag, 'downloading');
    doc = completeRuntimeAttempt(doc, '1.0.0');
    assert.throws(() => beginRuntimeAttempt(doc, npm('1.0.0')));
  });
});
