/**
 * Additional directories (glossary): absolute directories handed to the Agent beyond the Session cwd, and the optional
 * `.code-workspace` file they came from. The Harness carries the intended list whatever the Agent supports; only the
 * session RPC seam decides whether it goes on the wire. An empty list is the same as none everywhere.
 */

export type SessionDirectories = {
  readonly additionalDirectories?: readonly string[];
  /**
   * The user edited this session's list (desktop ADR 0024): it wins over the Agent-side snapshot and over a Workspace file
   * re-read on activation. Set only by the edit; an unedited list is the one the session was created with.
   */
  readonly directoriesEdited?: true;
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
    ...(directories?.directoriesEdited === true ? { directoriesEdited: true as const } : {}),
    ...(workspaceFile === undefined ? {} : { workspaceFile }),
  };
};

/** `row` without the fields only the Harness may set (an Agent-supplied row never carries directories or the edited marker). */
export const omitSessionDirectories = <T extends Readonly<Record<string, unknown>>>(
  row: T,
): Omit<T, 'additionalDirectories' | 'directoriesEdited' | 'workspaceFile'> => {
  const { additionalDirectories: _directories, directoriesEdited: _edited, workspaceFile: _file, ...rest } = row;
  return rest;
};

/**
 * Activate resolve, like `resolveSessionCwd`: each field from the snapshot Session, else from its History entry. A History
 * entry the user edited wins as a whole (an empty edited list stays empty).
 */
export const resolveSessionDirectories = (
  snapshotSession: SessionDirectories | undefined,
  historyEntry: SessionDirectories | undefined,
): SessionDirectories =>
  historyEntry?.directoriesEdited === true
    ? normalizeSessionDirectories(historyEntry)
    : {
        ...normalizeSessionDirectories(historyEntry),
        ...normalizeSessionDirectories(snapshotSession),
      };

/** The label of a Workspace file: its file name without the extension. */
const workspaceFileLabel = (workspaceFile: string): string => {
  const base =
    workspaceFile
      .replace(/[/\\]+$/u, '')
      .split(/[/\\]/u)
      .pop() ?? workspaceFile;
  return base.replace(/\.code-workspace$/iu, '');
};

/** Session History's badge text for a session with a Workspace file and/or Additional directories; `undefined` for a plain one. */
export const sessionDirectoriesBadge = (directories: SessionDirectories): string | undefined => {
  const count = directories.additionalDirectories?.length ?? 0;
  const parts = [
    ...(directories.workspaceFile === undefined
      ? []
      : [`Workspace file: ${workspaceFileLabel(directories.workspaceFile)}`]),
    ...(count === 0 ? [] : [`${String(count)} additional ${count === 1 ? 'directory' : 'directories'}`]),
  ];
  return parts.length === 0 ? undefined : parts.join(' · ');
};

/** Same Additional directories as a set: order and duplicates do not matter, empty equals absent. */
export const sameDirectories = (a: readonly string[] | undefined, b: readonly string[] | undefined): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every(directory => right.has(directory));
};
