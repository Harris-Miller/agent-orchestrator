import { AO_HOME_DIRNAME, LaunchTargetSchema, PROVIDER_CURRENT_FILENAME, PROVIDERS_DIRNAME } from '@lib/ao-home';
import { Schema } from 'effect';

import { resolve, sep } from 'node:path';

const isLaunchTarget = Schema.is(LaunchTargetSchema);

/** True only for `<home>/.ao/providers/<launch-target>/current.json` with no traversal. */
export const isProviderCurrentJsonPath = (homedir: string, path: string): boolean => {
  const providersRoot = resolve(homedir, AO_HOME_DIRNAME, PROVIDERS_DIRNAME);
  const resolved = resolve(path);
  if (resolved !== path || !resolved.startsWith(providersRoot + sep)) {
    return false;
  }
  const segments = resolved.slice(providersRoot.length + 1).split(sep);
  return segments.length === 2 && isLaunchTarget(segments[0]) && segments[1] === PROVIDER_CURRENT_FILENAME;
};
