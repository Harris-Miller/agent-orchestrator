/**
 * Additional directories (glossary): absolute directories handed to the Agent beyond the Session cwd, and the optional
 * `.code-workspace` file they came from. The Harness carries the intended list whatever the Agent supports; only the
 * session RPC seam decides whether it goes on the wire. An empty list is the same as none everywhere.
 */

export type SessionDirectories = {
  readonly additionalDirectories?: readonly string[];
  /** Never sent to the Agent. */
  readonly workspaceFile?: string;
};

const nonEmpty = (directories: readonly string[] | undefined): readonly string[] | undefined =>
  directories !== undefined && directories.length > 0 ? directories : undefined;

/** `directories` as a normalized record: no key for an absent or empty list or an absent workspace file. */
export const normalizeSessionDirectories = (directories: SessionDirectories | undefined): SessionDirectories => {
  const additionalDirectories = nonEmpty(directories?.additionalDirectories);
  const workspaceFile = directories?.workspaceFile;
  return {
    ...(additionalDirectories === undefined ? {} : { additionalDirectories }),
    ...(workspaceFile === undefined ? {} : { workspaceFile }),
  };
};

/** Activate resolve, like `resolveSessionCwd`: each field from the snapshot Session, else from its History entry. */
export const resolveSessionDirectories = (
  snapshotSession: SessionDirectories | undefined,
  historyEntry: SessionDirectories | undefined,
): SessionDirectories => ({
  ...normalizeSessionDirectories(historyEntry),
  ...normalizeSessionDirectories(snapshotSession),
});

/** Same Additional directories as a set: order and duplicates do not matter, empty equals absent. */
export const sameDirectories = (a: readonly string[] | undefined, b: readonly string[] | undefined): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every(directory => right.has(directory));
};

/** Wire `additionalDirectories` of a `session/list` row: the string list, or undefined when it is not one. */
export const additionalDirectoriesOfRow = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.every((item): item is string => typeof item === 'string') ? value : undefined;
