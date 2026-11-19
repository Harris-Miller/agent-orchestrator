import { Effect, Option } from 'effect';

import { emptySessionIndex, SessionIndexDocumentJsonString } from './SessionIndexDocument.ts';
import type { SessionIndexDocument, SessionIndexEntry } from './SessionIndexDocument.ts';
import { readJsonFile, writeJsonFile } from './harnessFiles.ts';
import type { LaunchTarget } from './LaunchTarget.ts';
import { providerFilePath } from './providers.ts';

/** Rows kept per cwd (newest `updatedAt`); pinned sessions of that cwd are kept on top of these. */
export const SESSION_INDEX_ROWS_PER_CWD = 10;

export const sessionIndexPath = Effect.fn('sessionIndexPath')(function* (launchTarget: LaunchTarget) {
  return yield* providerFilePath(launchTarget, 'session-index.json');
});

/** Missing or undecodable file reads empty: the index is rebuilt from `session/list`. */
export const readSessionIndex = Effect.fn('readSessionIndex')(function* (launchTarget: LaunchTarget) {
  const read = yield* readJsonFile(yield* sessionIndexPath(launchTarget), SessionIndexDocumentJsonString);
  return Option.getOrElse(read, () => emptySessionIndex);
});

/** Every row of the given cwds (all cwds when omitted), in file order. */
export const sessionIndexRows = (
  document: SessionIndexDocument,
  cwds?: ReadonlySet<string>,
): readonly SessionIndexEntry[] =>
  Object.entries(document.cwds).flatMap(([cwd, rows]) => (cwds === undefined || cwds.has(cwd) ? rows : []));

const newestFirst = (left: SessionIndexEntry, right: SessionIndexEntry): number => {
  const l = left.updatedAt ?? '';
  const r = right.updatedAt ?? '';
  if (l !== r) return l < r ? 1 : -1;
  return left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0;
};

/** The newest {@link SESSION_INDEX_ROWS_PER_CWD} rows plus every pinned one, newest first. */
export const capSessionIndexRows = (
  rows: readonly SessionIndexEntry[],
  pinnedIds: ReadonlySet<string>,
): readonly SessionIndexEntry[] => {
  const sorted = rows.toSorted(newestFirst);
  const newest = new Set(sorted.slice(0, SESSION_INDEX_ROWS_PER_CWD).map(row => row.sessionId));
  return sorted.filter(row => newest.has(row.sessionId) || pinnedIds.has(row.sessionId));
};

/**
 * Merge-on-write: re-reads the file and replaces only the cwds in `rowsByCwd` (each capped, see
 * {@link capSessionIndexRows}); a listed cwd with no rows loses its entry. Other cwds are left as they are.
 */
export const updateSessionIndex = Effect.fn('updateSessionIndex')(function* (
  launchTarget: LaunchTarget,
  rowsByCwd: Readonly<Record<string, readonly SessionIndexEntry[]>>,
  pinnedIds: ReadonlySet<string>,
) {
  const current = yield* readSessionIndex(launchTarget);
  const replaced = Object.entries(rowsByCwd).map(([cwd, rows]) => [cwd, capSessionIndexRows(rows, pinnedIds)] as const);
  const untouched = Object.entries(current.cwds).filter(([cwd]) => !(cwd in rowsByCwd));
  const cwds = Object.fromEntries([...untouched, ...replaced.filter(([, rows]) => rows.length > 0)]);
  yield* writeJsonFile(yield* sessionIndexPath(launchTarget), SessionIndexDocumentJsonString, { cwds });
});

/** Drops the entries of the given cwds (Stop tracking a Project). Other cwds are left as they are. */
export const removeSessionIndexCwds = Effect.fn('removeSessionIndexCwds')(function* (
  launchTarget: LaunchTarget,
  cwds: readonly string[],
) {
  const current = yield* readSessionIndex(launchTarget);
  const drop = new Set(cwds);
  const next = Object.fromEntries(Object.entries(current.cwds).filter(([cwd]) => !drop.has(cwd)));
  yield* writeJsonFile(yield* sessionIndexPath(launchTarget), SessionIndexDocumentJsonString, { cwds: next });
});
