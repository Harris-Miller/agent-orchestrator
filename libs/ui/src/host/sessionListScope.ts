import type { ListSessionsRequest } from '@libs/effect-acp';

/** How bootstrap/refresh call `session/list`. Desktop stays Unscoped; vscode sets Cwd/Skip. */
export type SessionListScope =
  | { readonly _tag: 'Cwd'; readonly cwd: string }
  | { readonly _tag: 'Skip' }
  | { readonly _tag: 'Unscoped' };

export const unscopedSessionListScope: SessionListScope = { _tag: 'Unscoped' };

/** Page size asked of `session/list`: the smaller of Claude's (200) and Codex's (100) clamps; other providers ignore it. */
export const SESSION_LIST_PAGE_LIMIT = 100;

/** AIR session index list filter: always all rows; Show archived filters in the app (libs/ui ADR-0008). */
const sessionListArchivedAll = {
  _meta: {
    jetbrains: {
      air: {
        list: { archived: 'all', limit: SESSION_LIST_PAGE_LIMIT },
        version: 1,
      },
    },
  },
} satisfies { readonly _meta: NonNullable<ListSessionsRequest['_meta']> };

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

export type ListSessionsPayload = NonNullable<ReturnType<typeof listSessionsPayload>>;
