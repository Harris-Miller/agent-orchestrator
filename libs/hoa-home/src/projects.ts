import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { writeJsonFile } from './harnessFiles.ts';
import { resolveHome } from './home.ts';
import { emptyProjects, ProjectsDocumentJsonString } from './ProjectsDocument.ts';
import type { ProjectsDocument } from './ProjectsDocument.ts';

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
 * Re-reads the file and applies only `change`, so a stale in-memory copy never rewrites other Projects.
 * Fails (writing nothing) when the file is malformed. Returns the document written.
 */
export const updateProjects = Effect.fn('updateProjects')(function* (
  change: (projects: readonly string[]) => readonly string[],
) {
  const current = yield* readProjects();
  const next: ProjectsDocument = { projects: change(current.projects) };
  yield* writeJsonFile(yield* projectsPath(), ProjectsDocumentJsonString, next);
  return next;
});

/** Adds a Project; idempotent. */
export const addProject = (cwd: string) =>
  updateProjects(projects => {
    const normalized = normalizeProjectPath(cwd);
    return projects.includes(normalized) ? projects : [...projects, normalized];
  });

export const removeProject = (cwd: string) => {
  const normalized = normalizeProjectPath(cwd);
  return updateProjects(projects => projects.filter(item => item !== normalized));
};
