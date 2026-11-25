import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { writeJsonFile } from './harnessFiles.ts';
import { resolveHome } from './home.ts';
import { emptyProjects, ProjectsDocumentJsonString } from './ProjectsDocument.ts';
import type { ProjectsDocument } from './ProjectsDocument.ts';
import { isWorkspaceFilePath } from './workspaceFile.ts';

/** `projects.json` exists but cannot be decoded. Never treated as "no Projects", so it is never overwritten. */
export class ProjectsMalformed extends Schema.TaggedError<ProjectsMalformed>()('ProjectsMalformed', {
  message: Schema.String,
}) {}

export const projectsPath = Effect.fn('projectsPath')(function* () {
  const path = yield* Path;
  return path.join(yield* resolveHome(), 'projects.json');
});

/** Paths compare exact after trailing-separator normalization; a bare root keeps its separator. */
export const normalizeProjectPath = (cwd: string): string => {
  const trimmed = cwd.replace(/[\\/]+$/u, '');
  if (trimmed.length === 0) return cwd.slice(0, 1) || cwd;
  // A Windows drive root ("C:\\") keeps its separator; "C:" alone means the drive's current directory.
  return /^[A-Za-z]:$/u.test(trimmed) ? `${trimmed}${cwd.charAt(trimmed.length)}` : trimmed;
};

/** Missing file → no Projects; undecodable content fails with {@link ProjectsMalformed}. */
export const readProjects = Effect.fn('readProjects')(function* () {
  const fs = yield* FileSystem;
  const filePath = yield* projectsPath();
  if (!(yield* fs.exists(filePath))) return emptyProjects;
  return yield* Schema.decodeEffect(ProjectsDocumentJsonString)(yield* fs.readFileString(filePath)).pipe(
    Effect.mapError(error => new ProjectsMalformed({ message: error.message })),
  );
});

/**
 * Re-reads the file and applies only `change` to the whole document, so a stale in-memory copy never rewrites other
 * Projects or their defaults. Fails (writing nothing) when the file is malformed. Returns the document written.
 */
export const updateProjectsDocument = Effect.fn('updateProjectsDocument')(function* (
  change: (document: ProjectsDocument) => ProjectsDocument,
) {
  const next = change(yield* readProjects());
  yield* writeJsonFile(yield* projectsPath(), ProjectsDocumentJsonString, next);
  return next;
});

/** Like {@link updateProjectsDocument}, for the Project list alone: the defaults stay as they are. */
export const updateProjects = (change: (projects: readonly string[]) => readonly string[]) =>
  updateProjectsDocument(document => ({ ...document, projects: change(document.projects) }));

/** Adds a Project; idempotent. */
export const addProject = (cwd: string) =>
  updateProjects(projects => {
    const normalized = normalizeProjectPath(cwd);
    return projects.includes(normalized) ? projects : [...projects, normalized];
  });

/** POSIX root, UNC or Windows drive path. */
const isAbsolutePath = (path: string): boolean =>
  path.startsWith('/') || path.startsWith('\\\\') || /^[A-Za-z]:[/\\]/u.test(path);

/** The document with `additionalDirectories` set, or left out when no Project has any (the old file shape). */
const withDefaults = (
  projects: readonly string[],
  defaults: Readonly<Record<string, readonly string[]>>,
): ProjectsDocument =>
  Object.keys(defaults).length === 0 ? { projects } : { additionalDirectories: defaults, projects };

/** Every directory Project's default Additional directories by Project path. */
export const projectDefaultsOf = (document: ProjectsDocument): Readonly<Record<string, readonly string[]>> =>
  document.additionalDirectories ?? {};

/** Removes a Project and its default Additional directories. */
export const removeProject = (cwd: string) => {
  const normalized = normalizeProjectPath(cwd);
  return updateProjectsDocument(document => {
    const { [normalized]: _removed, ...kept } = projectDefaultsOf(document);
    return withDefaults(
      document.projects.filter(item => item !== normalized),
      kept,
    );
  });
};

/**
 * A Project's default Additional directories as stored: absolute paths only, trailing separators normalized, the Project
 * itself dropped, duplicates removed, order kept.
 */
export const normalizeProjectDirectories = (project: string, directories: readonly string[]): readonly string[] => {
  const self = normalizeProjectPath(project);
  return [...new Set(directories.filter(isAbsolutePath).map(normalizeProjectPath))].filter(path => path !== self);
};

/**
 * Sets (or, with none left after normalizing, clears) a Project's default Additional directories. Only directory
 * Projects carry them; a path ending `.code-workspace` and a path that is not a Project are left untouched.
 */
export const setProjectAdditionalDirectories = (project: string, directories: readonly string[]) => {
  const normalized = normalizeProjectPath(project);
  return updateProjectsDocument(document => {
    if (isWorkspaceFilePath(normalized) || !document.projects.includes(normalized)) return document;
    const { [normalized]: _previous, ...others } = projectDefaultsOf(document);
    const stored = normalizeProjectDirectories(normalized, directories);
    return withDefaults(document.projects, stored.length === 0 ? others : { ...others, [normalized]: stored });
  });
};
