import { projectLabel, projectParentPath } from './projectResolution.ts';

/**
 * Parent path shown under a Project's label, only when another Project shares its label (case-insensitive);
 * otherwise undefined. The tooltip always carries the full path.
 */
export const projectParentCaption = (project: string, projects: readonly string[]): string | undefined => {
  const name = projectLabel(project).toLowerCase();
  const shared = projects.some(other => other !== project && projectLabel(other).toLowerCase() === name);
  if (!shared) return undefined;
  const parent = projectParentPath(project);
  return parent.length > 0 ? parent : undefined;
};
