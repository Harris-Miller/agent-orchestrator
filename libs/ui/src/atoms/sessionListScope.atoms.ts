import { Atom } from 'effect/reactivity';

import { projectsSessionListScope } from '../host/sessionListScope.ts';
import type { SessionListScope } from '../host/sessionListScope.ts';

export const sessionListScopeAtom = Atom.make<SessionListScope>(projectsSessionListScope).pipe(Atom.keepAlive);
