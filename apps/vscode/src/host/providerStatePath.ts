import { resolve, sep } from 'node:path';

const LAUNCH_TARGET = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True only for `<home>/.ao/providers/<launch-target>/current.json` with no traversal. */
export const isProviderCurrentJsonPath = (homedir: string, path: string): boolean => {
  const providersRoot = resolve(homedir, '.ao', 'providers');
  const resolved = resolve(path);
  if (resolved !== path || !resolved.startsWith(providersRoot + sep)) {
    return false;
  }
  const segments = resolved.slice(providersRoot.length + 1).split(sep);
  return segments.length === 2 && LAUNCH_TARGET.test(segments[0] ?? '') && segments[1] === 'current.json';
};
