/** Tracking a Workspace session adds only the Workspace cwd as a Project, never its Additional directories or workspace file. */
import { join, resolve } from 'node:path';

import { assert, describe, it } from '@effect/vitest';
import { projectsPath, readProjects } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';

import { CODEX, freshRegistry } from './fakeAgent.testing.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { trackSession } from './trackSession.ts';

const W = resolve('/w');
const LIB_A = resolve('/lib/a');
const LIB_B = resolve('/lib/b');
const WORKSPACE_FILE = join(W, 'app.code-workspace');

describe('trackSession in a Workspace', () => {
  it.effect('the Project is the Workspace cwd only', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
      const registry = yield* freshRegistry;
      registry.set(sessionListScopeAtom, { _tag: 'Cwd', cwd: W });

      yield* trackSession(registry, CODEX, {
        additionalDirectories: [LIB_A, LIB_B],
        cwd: W,
        sessionId: 's1',
        workspaceFile: WORKSPACE_FILE,
      }).pipe(Effect.provide(layer));

      const projects = yield* readProjects().pipe(Effect.provide(layer));
      assert.deepStrictEqual(projects.projects, [W]);
      const text = JSON.stringify(store.get(yield* projectsPath().pipe(Effect.provide(layer))));
      assert.notInclude(text, LIB_A);
      assert.notInclude(text, LIB_B);
      assert.notInclude(text, WORKSPACE_FILE);
    }).pipe(Effect.scoped),
  );
});
