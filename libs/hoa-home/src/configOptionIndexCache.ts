import { Effect } from 'effect';
import { Path } from 'effect/Path';

import type { LaunchTarget } from './LaunchTarget.ts';
import { readJsonFile, writeJsonFile } from './harnessFiles.ts';
import { providerDir } from './providers.ts';
import { ConfigOptionIndexDocumentJsonString } from './ConfigOptionIndexDocument.ts';
import type { ConfigOptionIndexDocument } from './ConfigOptionIndexDocument.ts';

export const configOptionIndexCachePath = Effect.fn('configOptionIndexCachePath')(function* (
  launchTarget: LaunchTarget,
) {
  const path = yield* Path;
  return path.join(yield* providerDir(launchTarget), 'config-option-index.json');
});

export const readConfigOptionIndexCache = Effect.fn('readConfigOptionIndexCache')(function* (
  launchTarget: LaunchTarget,
) {
  return yield* readJsonFile(yield* configOptionIndexCachePath(launchTarget), ConfigOptionIndexDocumentJsonString);
});

export const writeConfigOptionIndexCache = Effect.fn('writeConfigOptionIndexCache')(function* (
  launchTarget: LaunchTarget,
  document: ConfigOptionIndexDocument,
) {
  yield* writeJsonFile(yield* configOptionIndexCachePath(launchTarget), ConfigOptionIndexDocumentJsonString, document);
});
