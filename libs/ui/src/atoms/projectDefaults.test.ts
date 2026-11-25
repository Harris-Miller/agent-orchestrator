/** A Project's default Additional directories: new sessions inherit them, existing sessions and open drafts do not change. */
import { resolve } from 'node:path';

import { assert, describe, it } from '@effect/vitest';
import { addProject, readProjects } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { sameDirectories } from '../host/sessionDirectories.ts';
import { resolveProject } from '../host/projectResolution.ts';
import { makeRecordingAnalytics, summarize } from '../analytics/recordingAnalytics.testing.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import type { SessionRequest } from './fakeAgent.testing.ts';
import { CODEX, freshRegistry, installFakeAgent, setPhase } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { projectDefaultsAtom } from './projectDefaults.atoms.ts';
import { createProjectsAtoms, projectsAtom, projectsLoadedAtom, setProjectDirectories } from './projects.atoms.ts';
import { runAtomFn } from './runAtomFn.testing.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import {
  bindVirtualOnUsable,
  editVirtual,
  ensureVirtual,
  selectVirtualProject,
  setVirtualLaunchTarget,
  setWorkspaceDefaults,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';
import { workspaceDirectoriesAtom, workspaceFolderPathsAtom } from './workspaceFolderPaths.atoms.ts';
import { handleWorkspaceFoldersChanged } from './workspaceFolders.ts';

const P = resolve('/work/app');
const [X, Y] = [resolve('/lib/x'), resolve('/lib/y')];

describe('resolveProject with defaults', () => {
  it('gives a directory Project its defaults, a Project without any none, and a Workspace file never any', () => {
    const defaults = { [P]: [X, Y] };
    assert.deepStrictEqual(resolveProject(P, {}, defaults), { _tag: 'Ready', additionalDirectories: [X, Y], cwd: P });
    assert.deepStrictEqual(resolveProject(resolve('/other'), {}, defaults), {
      _tag: 'Ready',
      additionalDirectories: [],
      cwd: resolve('/other'),
    });
    const file = resolve('/w/app.code-workspace');
    const resolved = resolveProject(file, { [file]: { _tag: 'Resolved', folders: [P] } }, { [file]: [X] });
    assert.deepStrictEqual(resolved, { _tag: 'Ready', additionalDirectories: [], cwd: P, workspaceFile: file });
  });
});

const setup = Effect.fnUntraced(function* () {
  const store = new Map<string, MapFsEntry>();
  const analytics = makeRecordingAnalytics();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store), analytics.layer);
  const requests: SessionRequest[] = [];
  const registry = yield* freshRegistry;
  yield* installFakeAgent([], { additionalDirectories: true, requests });
  yield* addProject(P).pipe(Effect.provide(layer));
  registry.set(projectsAtom, [P]);
  registry.set(projectsLoadedAtom, true);
  const bind = Effect.gen(function* () {
    setPhase(registry, CODEX, 'connecting');
    yield* setVirtualLaunchTarget(registry, CODEX);
    setPhase(registry, CODEX, 'ready');
    yield* bindVirtualOnUsable(registry, CODEX);
  });
  return { analytics, bind, layer, registry, requests };
});

describe('a new desktop session in a Project with defaults', () => {
  it.effect('is created with the defaults, and the user can override them for that session only', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* setProjectDirectories(s.registry, P, [X, Y]).pipe(Effect.provide(s.layer));
      yield* ensureVirtual(s.registry, { project: P });
      yield* s.bind;
      assert.strictEqual(s.requests[0].params.cwd, P);
      assert.deepStrictEqual(s.requests[0].params.additionalDirectories, [X, Y]);

      yield* editVirtual(s.registry, { additionalDirectories: [X] });
      yield* bindVirtualOnUsable(s.registry, CODEX);
      assert.deepStrictEqual(s.requests.at(-1)?.params.additionalDirectories, [X]);
      assert.deepStrictEqual((yield* readProjects().pipe(Effect.provide(s.layer))).additionalDirectories, {
        [P]: [X, Y],
      });
    }).pipe(Effect.scoped),
  );

  it.effect('a Project without defaults sends none, and picking it clears another Project’s', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const other = resolve('/work/other');
      s.registry.set(projectDefaultsAtom, { [P]: [X] });
      yield* ensureVirtual(s.registry, { project: P });
      assert.deepStrictEqual(s.registry.get(virtualSessionAtom)?.additionalDirectories, [X]);
      yield* selectVirtualProject(s.registry, other);
      assert.isTrue(sameDirectories(s.registry.get(virtualSessionAtom)?.additionalDirectories, undefined));
      yield* s.bind;
      assert.isFalse('additionalDirectories' in s.requests[0].params);
    }).pipe(Effect.scoped),
  );

  it.effect('editing the defaults leaves Tracked sessions and an open draft as they were', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* setProjectDirectories(s.registry, P, [X]).pipe(Effect.provide(s.layer));
      yield* ensureVirtual(s.registry, { project: P });
      updateHarnessSnapshot(s.registry, CODEX, current => ({
        ...current,
        sessionHistory: [{ additionalDirectories: [X], cwd: P, sessionId: 'old' }],
        sessions: { old: { ...initialSessionSnapshot('old', 'inactive'), additionalDirectories: [X], cwd: P } },
      }));

      yield* setProjectDirectories(s.registry, P, [Y]).pipe(Effect.provide(s.layer));

      const snapshot = s.registry.get(backendHarnessSnapshotAtom(CODEX));
      assert.deepStrictEqual(snapshot.sessionHistory[0].additionalDirectories, [X]);
      assert.deepStrictEqual(snapshot.sessions.old.additionalDirectories, [X]);
      assert.deepStrictEqual(s.registry.get(virtualSessionAtom)?.additionalDirectories, [X]);
      // A session created after the edit gets the new set.
      yield* ensureVirtual(s.registry, { patchCwdIfSelectedVirtual: true, project: P });
      assert.deepStrictEqual(s.registry.get(virtualSessionAtom)?.additionalDirectories, [Y]);
    }).pipe(Effect.scoped),
  );

  it.effect('clearing removes the key, and each change records only the count', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const { setProjectDirectoriesAtomFn } = createProjectsAtoms(createHostRuntime(s.layer));
      yield* runAtomFn(s.registry, setProjectDirectoriesAtomFn, { directories: [X, Y], project: P });
      yield* runAtomFn(s.registry, setProjectDirectoriesAtomFn, { directories: [], project: P });
      assert.deepStrictEqual(s.registry.get(projectDefaultsAtom), {});
      assert.deepStrictEqual(summarize(s.analytics.events), [
        { name: 'project_directories_changed', properties: { directory_count: 2 } },
        { name: 'project_directories_changed', properties: { directory_count: 0 } },
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect('a save that changes nothing records no event', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const { setProjectDirectoriesAtomFn } = createProjectsAtoms(createHostRuntime(s.layer));
      yield* runAtomFn(s.registry, setProjectDirectoriesAtomFn, { directories: [X], project: P });
      yield* runAtomFn(s.registry, setProjectDirectoriesAtomFn, { directories: [X], project: P });
      yield* runAtomFn(s.registry, setProjectDirectoriesAtomFn, {
        directories: [X],
        project: resolve('/not/a/project'),
      });
      assert.strictEqual(s.analytics.events.length, 1);
    }).pipe(Effect.scoped),
  );
});

describe('VS Code: the Workspace folders and the Workspace cwd Project defaults combine', () => {
  const [W, A, B] = [resolve('/w'), resolve('/a'), resolve('/b')];

  it.effect('lists the other folders first, then the defaults not already there, never the cwd', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      registry.set(workspaceFolderPathsAtom, [W, A, B]);
      registry.set(projectDefaultsAtom, { [W]: [B, X, W, 'relative'] });
      assert.deepStrictEqual(registry.get(workspaceDirectoriesAtom).additionalDirectories, [A, B, X]);
      registry.set(projectDefaultsAtom, { [resolve('/else')]: [X] });
      assert.deepStrictEqual(registry.get(workspaceDirectoriesAtom).additionalDirectories, [A, B]);
    }).pipe(Effect.scoped),
  );

  it.effect('a defaults change reaches an unstarted draft on the Workspace cwd and a folder change keeps them', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.registry.set(sessionListScopeAtom, { _tag: 'Cwd', cwd: W });
      s.registry.set(workspaceFolderPathsAtom, [W, A]);
      yield* ensureVirtual(s.registry, { cwd: W });
      assert.deepStrictEqual(s.registry.get(virtualSessionAtom)?.additionalDirectories, [A]);

      yield* setWorkspaceDefaults(s.registry, { [W]: [X] });
      assert.deepStrictEqual(s.registry.get(virtualSessionAtom)?.additionalDirectories, [A, X]);

      yield* handleWorkspaceFoldersChanged(s.registry, { paths: [W, A, B] }).pipe(Effect.provide(mockHostLayer));
      assert.deepStrictEqual(s.registry.get(virtualSessionAtom)?.additionalDirectories, [A, B, X]);
    }).pipe(Effect.scoped),
  );
});
