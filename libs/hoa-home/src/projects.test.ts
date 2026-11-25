import { assert, describe, it, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { beforeEach } from 'vitest';

import {
  addProject,
  normalizeProjectDirectories,
  normalizeProjectPath,
  projectsPath,
  readProjects,
  removeProject,
  setProjectAdditionalDirectories,
} from './index.ts';
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

    testIt.effect(
      'stores default Additional directories per directory Project, keeping other Projects and defaults',
      () =>
        Effect.gen(function* () {
          yield* addProject('/a');
          yield* addProject('/b');
          yield* setProjectAdditionalDirectories('/a', ['/lib/x', '/lib/y/', '/lib/x', 'relative', '/a']);
          yield* setProjectAdditionalDirectories('/b', ['/lib/z']);
          assert.deepStrictEqual(yield* readProjects(), {
            additionalDirectories: { '/a': ['/lib/x', '/lib/y'], '/b': ['/lib/z'] },
            projects: ['/a', '/b'],
          });
          // Adding or removing another Project never touches the rest.
          yield* addProject('/c');
          yield* setProjectAdditionalDirectories('/a', []);
          assert.deepStrictEqual(yield* readProjects(), {
            additionalDirectories: { '/b': ['/lib/z'] },
            projects: ['/a', '/b', '/c'],
          });
        }),
    );

    testIt.effect('a Project with no defaults has no key, and the file keeps its old shape', () =>
      Effect.gen(function* () {
        yield* addProject('/a');
        yield* setProjectAdditionalDirectories('/a', ['/lib/x']);
        yield* setProjectAdditionalDirectories('/a', []);
        assert.deepStrictEqual(JSON.parse((store.get(file) as { content: string }).content), { projects: ['/a'] });
      }),
    );

    testIt.effect('removing a Project drops its defaults; a non-Project or Workspace file never gets any', () =>
      Effect.gen(function* () {
        yield* addProject('/a');
        yield* addProject('/ws/app.code-workspace');
        yield* setProjectAdditionalDirectories('/a', ['/lib/x']);
        yield* setProjectAdditionalDirectories('/unknown', ['/lib/x']);
        yield* setProjectAdditionalDirectories('/ws/app.code-workspace', ['/lib/x']);
        assert.deepStrictEqual((yield* readProjects()).additionalDirectories, { '/a': ['/lib/x'] });
        yield* removeProject('/a/');
        assert.deepStrictEqual(yield* readProjects(), { projects: ['/ws/app.code-workspace'] });
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

  it('normalizes default directories: absolute only, deduped, never the Project itself', () => {
    assert.deepStrictEqual(normalizeProjectDirectories('/p', ['/a/', 'rel', '/p', '/a', 'C:\\w', '/b']), [
      '/a',
      'C:\\w',
      '/b',
    ]);
  });
});
