import { ProviderRuntimeDocumentJsonString } from '@lib/ao-home';
import { Schema } from 'effect';

import { join, resolve, sep } from 'node:path';

const decodeDocument = Schema.decodeUnknownSync(ProviderRuntimeDocumentJsonString);

/**
 * Map the logical Antigravity spawn name to the active runtime's recorded command and arguments.
 * `currentJson` is the raw `~/.ao/providers/antigravity-acp/current.json`. Throws when there is no usable
 * active binary runtime; the result is always contained in the provider's `runtime/` directory.
 */
export const resolveAntigravitySpawn = (
  homedir: string,
  currentJson: string,
): { readonly args: readonly string[]; readonly command: string } => {
  const document = decodeDocument(currentJson);
  const { active } = document;
  if (active === null) {
    throw new Error('No Antigravity runtime installed. Download it in Settings > Providers');
  }
  const entry = document.catalog.find(candidate => candidate.version === active.version);
  if (entry?.state._tag !== 'completed' || entry.distribution._tag !== 'binary') {
    throw new Error('Active Antigravity runtime is not a completed binary runtime');
  }
  const runtimeRoot = resolve(homedir, '.ao', 'providers', 'antigravity-acp', 'runtime');
  const command = resolve(join(runtimeRoot, active.version, entry.distribution.cmd));
  if (!command.startsWith(runtimeRoot + sep)) {
    throw new Error('Antigravity command escapes the provider runtime directory');
  }
  return { args: entry.distribution.args, command };
};
