import { Effect, Option } from 'effect';

import { emptySessionIndex, SessionIndexDocumentJsonString } from './SessionIndexDocument.ts';
import type { SessionIndexDocument } from './SessionIndexDocument.ts';
import { readJsonFile, writeJsonFile } from './harnessFiles.ts';
import type { LaunchTarget } from './LaunchTarget.ts';
import { providerFilePath } from './providers.ts';

export const sessionIndexPath = Effect.fn('sessionIndexPath')(function* (launchTarget: LaunchTarget) {
  return yield* providerFilePath(launchTarget, 'session-index.json');
});

export const readSessionIndex = Effect.fn('readSessionIndex')(function* (launchTarget: LaunchTarget) {
  const read = yield* readJsonFile(yield* sessionIndexPath(launchTarget), SessionIndexDocumentJsonString);
  return Option.getOrElse(read, () => emptySessionIndex);
});

export const writeSessionIndex = Effect.fn('writeSessionIndex')(function* (
  launchTarget: LaunchTarget,
  document: SessionIndexDocument,
) {
  yield* writeJsonFile(yield* sessionIndexPath(launchTarget), SessionIndexDocumentJsonString, document);
});
