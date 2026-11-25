/** Workspace projects: adding, hydrating, listing, grouping and Stop tracking through the Project resolution seam. */
import { resolve } from 'node:path';

import { assert, describe, it } from '@effect/vitest';
import { addProject, isWorkspaceFilePath, readProjects, upsertTrackedSessions } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';

import { makeRecordingAnalytics, summarize } from '../analytics/recordingAnalytics.testing.ts';
import { trackEvent } from '../analytics/trackEvent.ts';
import { projectAdded } from '../analytics/catalog.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import { groupAndSortSessionsForNav } from '../host/groupAndSortSessionsForNav.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { CODEX, freshRegistry } from './fakeAgent.testing.ts';
import { hydrateHarnessCaches } from './harnessHydration.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { listedCwdsAtom, listedSessionHistoryAtom } from './listedCwds.atoms.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import {
  addProjectToApp,
  projectMembershipAtom,
  projectsAtom,
  projectsLoadedAtom,
  removeProjectEverywhere,
  repickProject,
} from './projects.atoms.ts';
import { settleTrackedSessionWrites } from './trackedSessions.ts';
import { refreshWorkspaceProject, workspaceFilesAtom } from './workspaceFiles.atoms.ts';

const W = resolve('/home/operator/work/app.code-workspace');
const [A, B] = [resolve('/home/operator/a'), resolve('/home/operator/b')];
const codex = toLaunchTarget(CODEX);

const setup = Effect.fnUntraced(function* () {
  const store = new Map<string, MapFsEntry>();
  const analytics = makeRecordingAnalytics();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store), analytics.layer);
  const registry = yield* freshRegistry;
  registry.set(projectsLoadedAtom, true);
  const writeWorkspace = (content: string, path = W) => {
    store.set(path, { kind: 'file', content });
  };
  const add = (project: string) =>
    addProjectToApp(registry, project).pipe(
      trackEvent(projectAdded(isWorkspaceFilePath(project) ? 'workspace_file' : 'directory'), result => result.added),
      Effect.provide(layer),
    );
  const history = () => registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory.map(row => row.sessionId);
  return { add, analytics, history, layer, registry, store, writeWorkspace };
});

describe('adding a Workspace project', () => {
  it.effect('resolves the file, lists its first folder and hydrates the Tracked sessions stamped there', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.writeWorkspace('{"folders":[{"path":"/home/operator/a"},{"path":"/home/operator/b"}]}');
      yield* upsertTrackedSessions(codex, [
        { cwd: A, sessionId: 'in-ws', workspaceFile: W },
        { cwd: B, sessionId: 'second-folder' },
      ]).pipe(Effect.provide(s.layer));
      const result = yield* s.add(W);
      assert.deepStrictEqual(result, { added: true, kind: 'workspace_file' });
      assert.deepStrictEqual(s.registry.get(projectsAtom), [W]);
      assert.deepStrictEqual(s.registry.get(listedCwdsAtom), [A]);
      assert.deepStrictEqual(s.history(), ['in-ws']);
      assert.deepStrictEqual(summarize(s.analytics.events), [
        { name: 'project_added', properties: { kind: 'workspace_file' } },
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect('fails with the reason and adds nothing when the file has no usable folder', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.writeWorkspace('{"folders":[{"uri":"vscode-remote://box/srv"}]}');
      const error = yield* Effect.flip(s.add(W));
      assert.strictEqual(error._tag, 'WorkspaceFileUnresolvable');
      assert.deepStrictEqual(s.registry.get(projectsAtom), []);
      assert.deepStrictEqual((yield* readProjects().pipe(Effect.provide(s.layer))).projects, []);
      assert.deepStrictEqual(s.analytics.events, []);
    }).pipe(Effect.scoped),
  );

  it.effect('counts only a new Project: re-adding records no second event', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.writeWorkspace('{"folders":[{"path":"/home/operator/a"}]}');
      yield* s.add(W);
      assert.deepStrictEqual(yield* s.add(W), { added: false, kind: 'workspace_file' });
      yield* s.add(resolve('/home/operator/dir'));
      assert.deepStrictEqual(
        summarize(s.analytics.events).map(event => event.properties),
        [{ kind: 'workspace_file' }, { kind: 'directory' }],
      );
    }).pipe(Effect.scoped),
  );
});

describe('startup with Workspace projects', () => {
  it.effect('an unresolvable file keeps the Project and lists nothing, its rows stay dormant', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* addProject(W).pipe(Effect.provide(s.layer));
      yield* upsertTrackedSessions(codex, [{ cwd: A, sessionId: 'dormant', workspaceFile: W }]).pipe(
        Effect.provide(s.layer),
      );
      const unsubscribe = yield* hydrateHarnessCaches(s.registry).pipe(Effect.provide(s.layer));
      yield* Effect.promise(settleTrackedSessionWrites);
      assert.deepStrictEqual(s.registry.get(projectsAtom), [W]);
      assert.deepStrictEqual(s.registry.get(listedCwdsAtom), []);
      assert.strictEqual(s.registry.get(workspaceFilesAtom)[W]?._tag, 'Failed');
      assert.deepStrictEqual(s.history(), []);
      unsubscribe();
    }).pipe(Effect.scoped),
  );

  it.effect('a readable file lists its first folder and hydrates its sessions', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.writeWorkspace('{"folders":[{"path":"/home/operator/a"},{"path":"/home/operator/b"}]}');
      yield* addProject(W).pipe(Effect.provide(s.layer));
      yield* upsertTrackedSessions(codex, [{ cwd: A, sessionId: 's1', workspaceFile: W }]).pipe(
        Effect.provide(s.layer),
      );
      const unsubscribe = yield* hydrateHarnessCaches(s.registry).pipe(Effect.provide(s.layer));
      yield* Effect.promise(settleTrackedSessionWrites);
      assert.deepStrictEqual(s.registry.get(listedCwdsAtom), [A]);
      assert.deepStrictEqual(s.history(), ['s1']);
      unsubscribe();
    }).pipe(Effect.scoped),
  );
});

describe('Projects sharing a first folder', () => {
  const D = A;
  const seed = Effect.fnUntraced(function* () {
    const s = yield* setup();
    s.registry.set(projectsAtom, [D, W]);
    s.registry.set(workspaceFilesAtom, { [W]: { _tag: 'Resolved', folders: [D, B] } });
    updateHarnessSnapshot(s.registry, CODEX, current => ({
      ...current,
      sessionHistory: [
        { cwd: D, sessionId: 'plain' },
        { cwd: D, sessionId: 'in-ws', workspaceFile: W },
      ],
      sessions: {
        plain: { ...initialSessionSnapshot('plain', 'active'), cwd: D },
        'in-ws': { ...initialSessionSnapshot('in-ws', 'active'), cwd: D, workspaceFile: W },
      },
    }));
    return s;
  });

  it.effect('groups each session under the Project it belongs to', () =>
    Effect.gen(function* () {
      const s = yield* seed();
      const groups = groupAndSortSessionsForNav(s.registry.get(listedSessionHistoryAtom), s.registry.get(projectsAtom));
      assert.deepStrictEqual(
        groups.map(group => [group.cwd, group.sessions.map(row => row.sessionId)]),
        [
          [D, ['plain']],
          [W, ['in-ws']],
        ],
      );
      assert.deepStrictEqual(
        s.registry.get(projectMembershipAtom(W)).activeSessions.map(t => t.sessionId),
        ['in-ws'],
      );
      assert.deepStrictEqual(
        s.registry.get(projectMembershipAtom(D)).activeSessions.map(t => t.sessionId),
        ['plain'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('removing the directory Project keeps the Workspace project rows, and the reverse', () =>
    Effect.gen(function* () {
      const s = yield* seed();
      yield* addProject(D).pipe(Effect.provide(s.layer));
      yield* addProject(W).pipe(Effect.provide(s.layer));
      yield* removeProjectEverywhere(s.registry, D).pipe(Effect.provide(s.layer));
      assert.deepStrictEqual(s.history(), ['in-ws']);

      const t = yield* seed();
      yield* addProject(D).pipe(Effect.provide(t.layer));
      yield* addProject(W).pipe(Effect.provide(t.layer));
      yield* removeProjectEverywhere(t.registry, W).pipe(Effect.provide(t.layer));
      assert.deepStrictEqual(t.history(), ['plain']);
      assert.isUndefined(t.registry.get(workspaceFilesAtom)[W]);
    }).pipe(Effect.scoped),
  );
});

describe('re-reading and re-picking a Workspace project', () => {
  it.effect('a fixed file brings an errored Project back and hydrates its sessions', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* addProject(W).pipe(Effect.provide(s.layer));
      yield* upsertTrackedSessions(codex, [{ cwd: A, sessionId: 'back', workspaceFile: W }]).pipe(
        Effect.provide(s.layer),
      );
      s.registry.set(projectsAtom, [W]);
      yield* refreshWorkspaceProject(s.registry, W).pipe(Effect.provide(s.layer));
      assert.strictEqual(s.registry.get(workspaceFilesAtom)[W]?._tag, 'Failed');
      assert.deepStrictEqual(s.history(), []);

      s.writeWorkspace(JSON.stringify({ folders: [{ path: A }] }));
      yield* refreshWorkspaceProject(s.registry, W).pipe(Effect.provide(s.layer));
      assert.strictEqual(s.registry.get(workspaceFilesAtom)[W]?._tag, 'Resolved');
      assert.deepStrictEqual(s.history(), ['back']);
    }).pipe(Effect.scoped),
  );

  it.effect('re-pick moves the sessions stamped with the old file onto the new one', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const moved = resolve('/home/operator/work/moved.code-workspace');
      s.writeWorkspace(JSON.stringify({ folders: [{ path: A }, { path: B }] }), moved);
      yield* addProject(W).pipe(Effect.provide(s.layer));
      s.registry.set(projectsAtom, [W]);
      s.registry.set(workspaceFilesAtom, { [W]: { _tag: 'Failed', message: 'gone' } });
      updateHarnessSnapshot(s.registry, CODEX, current => ({
        ...current,
        sessionHistory: [{ cwd: A, sessionId: 'kept', workspaceFile: W }],
      }));
      yield* repickProject(s.registry, W, moved).pipe(Effect.provide(s.layer));

      assert.deepStrictEqual(s.registry.get(projectsAtom), [moved]);
      const [row] = s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory;
      assert.deepStrictEqual([row.sessionId, row.workspaceFile, row.additionalDirectories], ['kept', moved, [B]]);
      assert.isUndefined(s.registry.get(workspaceFilesAtom)[W]);
    }).pipe(Effect.scoped),
  );
});
