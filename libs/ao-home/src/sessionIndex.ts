import { Effect, Option } from 'effect';
import { Path } from 'effect/Path';

import { emptySessionIndex, SessionIndexDocumentJsonString } from './SessionIndexDocument.ts';
import type { SessionIndexDocument } from './SessionIndexDocument.ts';
import { harnessDirPath, readJsonFile, writeJsonFile } from './harnessFiles.ts';
import type { LaunchTarget } from './LaunchTarget.ts';

export const sessionIndexPath = Effect.fn('sessionIndexPath')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  return path.join(yield* harnessDirPath(launchTarget), 'session-index.json');
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
