/**
 * The Project resolution seam (desktop glossary: Workspace project). A Project path is either a directory or a
 * Workspace file; this module turns it into the `{cwd, additionalDirectories, workspaceFile?}` a session is created
 * with, so a Workspace file path is never used as a Session cwd. A directory Project is the identity case.
 * Pure: reading the files is `workspaceFiles.atoms.ts`.
 */
import { isWorkspaceFilePath, WORKSPACE_FILE_EXTENSION } from '@lib/hoa-home';

import { directoryBasename } from './directoryBasename.ts';

/** What a Project path is: a directory, or a Workspace file. The `project_added` event's only property. */
export const projectKind = (project: string): 'directory' | 'workspace_file' =>
  isWorkspaceFilePath(project) ? 'workspace_file' : 'directory';

/** Default Additional directories by directory Project path. */
export type ProjectDefaults = Readonly<Record<string, readonly string[]>>;

/** What reading one Workspace file gave: its folders (in order), or why it cannot be used. */
export type WorkspaceFileState =
  | { readonly _tag: 'Failed'; readonly message: string }
  | { readonly _tag: 'Resolved'; readonly folders: readonly string[] };

/** The read state of every Workspace project by path; an absent path was not read yet. */
export type WorkspaceFileStates = Readonly<Record<string, WorkspaceFileState>>;

export type ProjectResolution =
  | { readonly _tag: 'Error'; readonly message: string }
  | { readonly _tag: 'Pending' }
  | {
      readonly _tag: 'Ready';
      /** Rest of the folders, in order; a directory Project's default Additional directories (none unless it has some). */
      readonly additionalDirectories: readonly string[];
      /** The Session cwd: the Project itself, or the Workspace file's first folder. */
      readonly cwd: string;
      readonly workspaceFile?: string;
    };

/** A directory Project's default Additional directories (none when it has no entry). */
export const projectDefaultsFor = (defaults: ProjectDefaults, project: string): readonly string[] =>
  Object.hasOwn(defaults, project) ? defaults[project] : [];

export const resolveProject = (
  project: string,
  states: WorkspaceFileStates,
  defaults: ProjectDefaults = {},
): ProjectResolution => {
  if (!isWorkspaceFilePath(project)) {
    return {
      _tag: 'Ready',
      additionalDirectories: projectDefaultsFor(defaults, project),
      cwd: project,
    };
  }
  const state = Object.hasOwn(states, project) ? states[project] : undefined;
  if (state === undefined) return { _tag: 'Pending' };
  if (state._tag === 'Failed') return { _tag: 'Error', message: state.message };
  const [cwd, ...additionalDirectories] = state.folders;
  return { _tag: 'Ready', additionalDirectories, cwd, workspaceFile: project };
};

/** The Session cwds Session History lists for `projects`: every ready Project's cwd, once. Errored and pending Projects list none. */
export const resolvedProjectCwds = (projects: readonly string[], states: WorkspaceFileStates): readonly string[] => {
  const cwds = new Set<string>();
  for (const project of projects) {
    const resolution = resolveProject(project, states);
    if (resolution._tag === 'Ready') cwds.add(resolution.cwd);
  }
  return [...cwds];
};

/** The Project a Tracked session or session belongs to, or `undefined`. One rule for grouping, listing, membership and Stop tracking. */
export const projectOfRecord = (
  record: { readonly cwd: string; readonly workspaceFile?: string },
  projects: readonly string[],
): string | undefined => {
  const { workspaceFile } = record;
  if (workspaceFile !== undefined && isWorkspaceFilePath(workspaceFile) && projects.includes(workspaceFile)) {
    return workspaceFile;
  }
  return projects.includes(record.cwd) ? record.cwd : undefined;
};

/** A Project's display name: a Workspace file's name without its extension, else the directory's basename. */
export const projectLabel = (project: string): string => {
  const base = directoryBasename(project);
  return isWorkspaceFilePath(project) ? base.slice(0, base.length - WORKSPACE_FILE_EXTENSION.length) : base;
};

/** The directory a Project lives in (a Workspace file's directory, a directory's parent), trailing separators stripped. */
export const projectParentPath = (project: string): string => {
  const trimmed = project.replace(/[/\\]+$/u, '');
  return trimmed.slice(0, Math.max(0, trimmed.length - directoryBasename(project).length)).replace(/[/\\]+$/u, '');
};
