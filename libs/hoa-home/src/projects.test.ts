import { assert, describe, it, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { beforeEach } from 'vitest';

import { addProject, normalizeProjectPath, projectsPath, readProjects, removeProject } from './index.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const store = new Map<string, MapFsEntry>();
const file = '/home/operator/.hoa/projects.json';

describe('projects', () => {
  beforeEach(() => {
    store.clear();
  });
  layer(mapFsTestServices(store))(testIt => {
    testIt.effect('reads empty when missing, adds idempotently in order, removes', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* projectsPath(), file);
        assert.deepStrictEqual(yield* readProjects(), { projects: [] });
        yield* addProject('/a');
        yield* addProject('/b');
        yield* addProject('/b/');
        yield* addProject('/c');
        assert.deepStrictEqual(yield* readProjects(), { projects: ['/a', '/b', '/c'] });
        yield* removeProject('/b/');
        assert.deepStrictEqual((yield* readProjects()).projects, ['/a', '/c']);
      }),
    );

    testIt.effect('re-reads the file so an external Project survives a later change', () =>
      Effect.gen(function* () {
        yield* addProject('/a');
        store.set(file, { kind: 'file', content: JSON.stringify({ projects: ['/a', '/external'] }) });
        yield* addProject('/b');
        assert.deepStrictEqual((yield* readProjects()).projects, ['/a', '/external', '/b']);
      }),
    );

    testIt.effect('never overwrites a malformed file', () =>
      Effect.gen(function* () {
        store.set(file, { kind: 'file', content: '{bad' });
        const exit = yield* Effect.exit(addProject('/a'));
        assert.isTrue(Exit.isFailure(exit));
        assert.deepStrictEqual(store.get(file), { kind: 'file', content: '{bad' });
        assert.isTrue(Exit.isFailure(yield* Effect.exit(readProjects())));
      }),
    );
  });
  it('normalizes trailing separators but keeps a root', () => {
    assert.strictEqual(normalizeProjectPath('/a/b//'), '/a/b');
    assert.strictEqual(normalizeProjectPath('/'), '/');
    assert.strictEqual(normalizeProjectPath('C:\\'), 'C:\\');
    assert.strictEqual(normalizeProjectPath('C:\\a\\'), 'C:\\a');
  });
});
