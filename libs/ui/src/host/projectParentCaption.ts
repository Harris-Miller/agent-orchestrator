import { directoryBasename } from './directoryBasename.ts';

/**
 * Parent path shown under a Project's label, only when another Project shares its basename (case-insensitive);
 * otherwise undefined. The tooltip always carries the full path.
 */
export const projectParentCaption = (cwd: string, projects: readonly string[]): string | undefined => {
  const name = directoryBasename(cwd).toLowerCase();
  const shared = projects.some(other => other !== cwd && directoryBasename(other).toLowerCase() === name);
  if (!shared) return undefined;
  const trimmed = cwd.replace(/[/\\]+$/, '');
  const parent = trimmed.slice(0, Math.max(0, trimmed.length - directoryBasename(cwd).length)).replace(/[/\\]+$/, '');
  return parent.length > 0 ? parent : undefined;
};
