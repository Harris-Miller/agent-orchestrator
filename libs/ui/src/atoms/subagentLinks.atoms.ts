/** The Spawned subagent session links (a leaf module: the fold, History, workspace folders and lifecycle all read it). */
import { Atom } from 'effect/reactivity';

import type { SpawnedLinks } from '../host/subagentLinks.ts';

/** Spawns past their cap check but without a link yet, per parent: they count toward the live-children cap. */
export const pendingSpawnsAtom = Atom.make<ReadonlyMap<string, number>>(new Map()).pipe(
  Atom.withLabel('pendingSpawns'),
  Atom.keepAlive,
);

export const spawnedLinksAtom = Atom.make<SpawnedLinks>(new Map()).pipe(Atom.withLabel('spawnedLinks'), Atom.keepAlive);
