/** The cwds Session History lists on this host, and the Session History rows that belong to them. */
import { Atom } from 'effect/reactivity';

import type { UnifiedHistoryEntry } from '../host/acpSessionBootstrap.ts';
import { projectOfRecord } from '../host/projectResolution.ts';
import { listCwdsForScope } from '../host/sessionListScope.ts';

import { unifiedSessionHistoryAtom, visibleSessionHistoryAtom } from './backendState.atoms.ts';
import { projectsAtom } from './projects.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { workspaceFilesAtom } from './workspaceFiles.atoms.ts';
import { withoutWorkstreamOwned, workstreamOwnedKeysAtom } from './workstreams.atoms.ts';

/** Every ready Project's Session cwd on desktop (a Workspace project's first folder), the Workspace cwd in VS Code, none when skipped. */
export const listedCwdsAtom = Atom.make(get =>
  listCwdsForScope(get(sessionListScopeAtom), get(projectsAtom), get(workspaceFilesAtom)),
).pipe(Atom.keepAlive);

/**
 * The rows this host lists. On desktop a row must belong to a Project (`projectOfRecord`), so a row that has no group in
 * the nav (a plain session in a folder only a Workspace project lists) is not searchable or adoptable either. VS Code lists
 * by the Workspace cwd.
 */
const rowsInScope = (get: <A>(atom: Atom.Atom<A>) => A, rows: readonly UnifiedHistoryEntry[]) => {
  const scope = get(sessionListScopeAtom);
  if (scope._tag === 'Projects') {
    const projects = get(projectsAtom);
    return rows.filter(entry => projectOfRecord(entry, projects) !== undefined);
  }
  const listed = new Set(get(listedCwdsAtom));
  return rows.filter(entry => listed.has(entry.cwd));
};

/** Session History rows (archived included) whose cwd this host lists, minus sessions a Workstream owns (while on). */
export const listedSessionHistoryAtom = Atom.make(get =>
  withoutWorkstreamOwned(rowsInScope(get, get(unifiedSessionHistoryAtom)), get(workstreamOwnedKeysAtom)),
).pipe(Atom.keepAlive);

/** Like `listedSessionHistoryAtom`, with archived rows hidden unless Show archived is on. */
export const visibleListedSessionHistoryAtom = Atom.make(get =>
  withoutWorkstreamOwned(rowsInScope(get, get(visibleSessionHistoryAtom)), get(workstreamOwnedKeysAtom)),
).pipe(Atom.keepAlive);
