/** How bootstrap/refresh call `session/list`. Desktop stays Unscoped; vscode sets Cwd/Skip. */
export type SessionListScope =
  { readonly _tag: 'Cwd'; readonly cwd: string } | { readonly _tag: 'Skip' } | { readonly _tag: 'Unscoped' };

export const unscopedSessionListScope: SessionListScope = { _tag: 'Unscoped' };

/** AIR session index list filter. `"all"` includes archived sessions. */
const sessionListArchivedAll = {
  _meta: {
    jetbrains: {
      air: {
        list: { archived: 'all' },
        version: 1,
      },
    },
  },
} as const;

export const sessionListScopeFromPaths = (paths: readonly string[]): SessionListScope => {
  if (paths.length === 0) {
    return { _tag: 'Skip' };
  }
  const [cwd] = paths;
  return { _tag: 'Cwd', cwd };
};

/** Payload for `session/list` given current scope, or undefined when Skip (no RPC). */
export const listSessionsPayload = (
  scope: SessionListScope,
): { readonly _meta: (typeof sessionListArchivedAll)['_meta']; readonly cwd?: string } | undefined => {
  switch (scope._tag) {
    case 'Cwd':
      return { ...sessionListArchivedAll, cwd: scope.cwd };
    case 'Skip':
      return undefined;
    case 'Unscoped':
      return sessionListArchivedAll;
  }
};
