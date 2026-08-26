import { OS } from '@lib/context-services';
import { Layer } from 'effect';

import * as os from 'node:os';
import * as process from 'node:process';

const processEnvRecord = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
};

/** Node/Bun host implementation of {@link OS} via `node:os` / `process`. */
export const OSLive = Layer.succeed(OS, {
  cwd: () => process.cwd(),
  env: () => processEnvRecord(),
  homedir: () => os.homedir(),
  platform: () => os.platform(),
});
