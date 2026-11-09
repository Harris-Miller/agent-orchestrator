import { Atom } from 'effect/reactivity';

/** Transient search text, scoped to the host's current history. */
export const sessionHistorySearchAtom = Atom.make<{ readonly scope: string | undefined; readonly query: string }>({
  scope: undefined,
  query: '',
}).pipe(Atom.keepAlive);
