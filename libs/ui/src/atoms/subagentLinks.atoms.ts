/** The Spawned subagent session links (a leaf module: the fold, History, workspace folders and lifecycle all read it). */
import { Atom } from 'effect/reactivity';

import type { SpawnedLinks } from '../host/subagentLinks.ts';

export const spawnedLinksAtom = Atom.make<SpawnedLinks>(new Map()).pipe(Atom.withLabel('spawnedLinks'), Atom.keepAlive);
