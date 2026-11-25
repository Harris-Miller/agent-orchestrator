import { Atom } from 'effect/reactivity';

import { sameDirectories } from '../host/sessionDirectories.ts';

import {
  backendHarnessSnapshotAtom,
  selectedAtom,
  selectedSessionAtom,
  selectedSessionLaunchTargetAtom,
} from './backendState.atoms.ts';
import { projectOfRecord, resolveProject } from '../host/projectResolution.ts';

import { projectDefaultsAtom } from './projectDefaults.atoms.ts';
import { projectsAtom } from './projects.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';
import { workspaceFilesAtom } from './workspaceFiles.atoms.ts';
import { workspaceDirectoriesAtom } from './workspaceFolderPaths.atoms.ts';

/**
 * True when the Selected session (or the Virtual draft) has Additional directories its Agent will not receive because
 * the Agent did not advertise `sessionCapabilities.additionalDirectories`: the composer cwd strip hints that only the
 * first folder is used.
 */
export const extraFoldersIgnoredAtom = Atom.make((get): boolean => {
  const selected = get(selectedAtom);
  if (selected === undefined) return false;
  const virtual = selected._tag === 'Virtual' ? get(virtualSessionAtom) : null;
  const launchTarget = virtual === null ? get(selectedSessionLaunchTargetAtom) : virtual.launchTarget;
  const directories =
    virtual === null ? get(selectedSessionAtom)?.additionalDirectories : virtual.additionalDirectories;
  if (launchTarget === undefined || sameDirectories(directories, undefined)) return false;
  return !get(backendHarnessSnapshotAtom(launchTarget)).agentCapabilities.sessionAdditionalDirectories;
}).pipe(Atom.keepAlive);

/**
 * What "Reset" in the Virtual session's directories editor goes back to: on desktop the draft's Project resolved afresh
 * (its Workspace file's folders, or its default Additional directories); in VS Code the Workspace folders and the
 * Workspace cwd Project's defaults.
 */
export const virtualDirectoryDefaultsAtom = Atom.make((get): readonly string[] => {
  const virtual = get(virtualSessionAtom);
  if (virtual?.cwd === undefined) return [];
  if (get(sessionListScopeAtom)._tag !== 'Projects') return get(workspaceDirectoriesAtom).additionalDirectories ?? [];
  const project =
    projectOfRecord({ cwd: virtual.cwd, workspaceFile: virtual.workspaceFile }, get(projectsAtom)) ?? virtual.cwd;
  const resolved = resolveProject(project, get(workspaceFilesAtom), get(projectDefaultsAtom));
  return resolved._tag === 'Ready' ? resolved.additionalDirectories : [];
}).pipe(Atom.keepAlive);
