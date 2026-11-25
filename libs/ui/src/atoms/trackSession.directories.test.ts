/** Tracking a Workspace session adds only the Workspace cwd as a Project, never its Additional directories or workspace file. */
import { assert, describe, it } from '@effect/vitest';
import { projectsPath, readProjects } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';

import { CODEX, freshRegistry } from './fakeAgent.testing.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { trackSession } from './trackSession.ts';

describe('trackSession in a Workspace', () => {
  it.effect('the Project is the Workspace cwd only', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
      const registry = yield* freshRegistry;
      registry.set(sessionListScopeAtom, { _tag: 'Cwd', cwd: '/w' });

      yield* trackSession(registry, CODEX, {
        additionalDirectories: ['/lib/a', '/lib/b'],
        cwd: '/w',
        sessionId: 's1',
        workspaceFile: '/w/app.code-workspace',
      }).pipe(Effect.provide(layer));

      const projects = yield* readProjects().pipe(Effect.provide(layer));
      assert.deepStrictEqual(projects.projects, ['/w']);
      const text = JSON.stringify(store.get(yield* projectsPath().pipe(Effect.provide(layer))));
      assert.isFalse(text.includes('/lib/') || text.includes('code-workspace'));
    }).pipe(Effect.scoped),
  );
});
