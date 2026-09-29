import { Atom } from 'effect/unstable/reactivity';

/** Absolute file-scheme Workspace folder paths (extension order). Empty = no folder. */
export const workspaceFolderPathsAtom = Atom.make<readonly string[]>([]).pipe(Atom.keepAlive);

/** Session cwd = first folder path, or undefined when none. */
export const sessionCwdAtom = Atom.make((get): string | undefined => get(workspaceFolderPathsAtom)[0]).pipe(
  Atom.keepAlive,
);
