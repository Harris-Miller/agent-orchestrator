import type { ListSessionsRequest } from '@lib/effect-acp';

import { declaresSessionIndex } from './agentCapabilities.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

/** Which cwds Session History shows. Desktop shows every Project; vscode sets Cwd/Skip from the Workspace. */
export type SessionListScope =
  | { readonly _tag: 'Cwd'; readonly cwd: string }
  | { readonly _tag: 'Projects' }
  | { readonly _tag: 'Skip' };

export const projectsSessionListScope: SessionListScope = { _tag: 'Projects' };

/** Only the desktop Projects scope reads `projects.json`; VS Code (Cwd/Skip) never reads it, it only adds its Workspace cwd as a Project. */
export const scopeReadsProjects = (scope: SessionListScope): boolean => scope._tag === 'Projects';

/** The cwds Session History shows under `scope`. */
export const listCwdsForScope = (scope: SessionListScope, projects: readonly string[]): readonly string[] => {
  switch (scope._tag) {
    case 'Cwd':
      return [scope.cwd];
    case 'Projects':
      return projects;
    case 'Skip':
      return [];
  }
};

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

/** `session/list` payload for one cwd: the AIR meta only for launch targets declaring `sessionIndex`; plain ACP otherwise. */
export const listSessionsPayload = (launchTarget: AgentLaunchTarget, cwd: string) =>
  declaresSessionIndex(launchTarget) ? { ...sessionListArchivedAll, cwd } : { cwd };

export type ListSessionsPayload = ReturnType<typeof listSessionsPayload>;
