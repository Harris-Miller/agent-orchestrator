/** The cwds Session History lists on this host, and the Session History rows that belong to them. */
import { Atom } from 'effect/reactivity';

import type { UnifiedHistoryEntry } from '../host/acpSessionBootstrap.ts';
import { listCwdsForScope } from '../host/sessionListScope.ts';

import { unifiedSessionHistoryAtom, visibleSessionHistoryAtom } from './backendState.atoms.ts';
import { projectsAtom } from './projects.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { hiddenFromSessionsPageKeysAtom, withoutWorkstreamOwned } from './workstreams.atoms.ts';

/** Every Project on desktop, the Workspace cwd in VS Code, none when skipped. */
export const listedCwdsAtom = Atom.make(get => listCwdsForScope(get(sessionListScopeAtom), get(projectsAtom))).pipe(
  Atom.keepAlive,
);

const rowsInListedCwds = (listedCwds: readonly string[], rows: readonly UnifiedHistoryEntry[]) => {
  const listed = new Set(listedCwds);
  return rows.filter(entry => listed.has(entry.cwd));
};

/** Session History rows (archived included) whose cwd this host lists, minus sessions a Workstream owns (while on). */
export const listedSessionHistoryAtom = Atom.make(get =>
  withoutWorkstreamOwned(
    rowsInListedCwds(get(listedCwdsAtom), get(unifiedSessionHistoryAtom)),
    get(hiddenFromSessionsPageKeysAtom),
  ),
).pipe(Atom.keepAlive);

/** Like `listedSessionHistoryAtom`, with archived rows hidden unless Show archived is on. */
export const visibleListedSessionHistoryAtom = Atom.make(get =>
  withoutWorkstreamOwned(
    rowsInListedCwds(get(listedCwdsAtom), get(visibleSessionHistoryAtom)),
    get(hiddenFromSessionsPageKeysAtom),
  ),
).pipe(Atom.keepAlive);
