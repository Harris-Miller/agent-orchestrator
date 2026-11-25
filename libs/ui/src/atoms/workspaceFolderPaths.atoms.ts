import { normalizeProjectDirectories, normalizeProjectPath } from '@lib/hoa-home';
import { Atom } from 'effect/reactivity';

import { normalizeSessionDirectories } from '../host/sessionDirectories.ts';
import type { SessionDirectories } from '../host/sessionDirectories.ts';

import { projectDefaultsAtom } from './projectDefaults.atoms.ts';

/** Absolute file-scheme Workspace folder paths (extension order). Empty = no folder. */
export const workspaceFolderPathsAtom = Atom.make<readonly string[]>([]).pipe(Atom.keepAlive);

/** The saved workspace's `.code-workspace` path; undefined for untitled, non-file and no workspace. */
export const workspaceFileAtom = Atom.make<string | undefined>(undefined).pipe(Atom.keepAlive);

/** Session cwd = first folder path, or undefined when none. */
export const sessionCwdAtom = Atom.make((get): string | undefined => get(workspaceFolderPathsAtom)[0]).pipe(
  Atom.keepAlive,
);

/**
 * What a new session in this workspace carries beyond its cwd: the other Workspace folders, then the default Additional
 * directories of the Workspace cwd's Project that are not among them, and the workspace file (desktop ADR 0023).
 */
export const workspaceDirectoriesAtom = Atom.make((get): SessionDirectories => {
  const [cwd, ...otherFolders] = get(workspaceFolderPathsAtom);
  const defaults = cwd === undefined ? undefined : get(projectDefaultsAtom)[normalizeProjectPath(cwd)];
  return normalizeSessionDirectories({
    additionalDirectories:
      cwd === undefined ? otherFolders : normalizeProjectDirectories(cwd, [...otherFolders, ...(defaults ?? [])]),
    workspaceFile: get(workspaceFileAtom),
  });
}).pipe(Atom.keepAlive);
