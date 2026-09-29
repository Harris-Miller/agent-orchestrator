import { Atom } from 'effect/unstable/reactivity';

import { unscopedSessionListScope } from '../host/sessionListScope.ts';
import type { SessionListScope } from '../host/sessionListScope.ts';

export const sessionListScopeAtom = Atom.make<SessionListScope>(unscopedSessionListScope).pipe(Atom.keepAlive);
