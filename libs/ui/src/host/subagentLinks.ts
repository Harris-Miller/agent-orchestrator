/**
 * Spawned subagent session links: which `(launch target, session)` is a child the Harness started for a parent. Pure
 * map operations; the atom that holds the map is `spawnedLinksAtom`. In memory only (like credentials): after a restart
 * the child is just a session on its own launch target.
 */
import { Deferred } from 'effect';
import type { Fiber } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

/** How a Spawned subagent session's Prompt turn ended; `text` is its final message (completed) or the cause. */
export type SubagentOutcome = {
  readonly status: 'cancelled' | 'completed' | 'failed';
  readonly text: string;
};

/**
 * Who has handed the outcome to the agent: nobody yet (`open`), a `wait_subagent` that returned it (`waited`, which
 * suppresses the report), or the Subagent report (`reported`). First write wins.
 */
export type SpawnedHandleState = 'open' | 'reported' | 'waited';

export type SpawnedLink = {
  readonly childLaunchTarget: AgentLaunchTarget;
  readonly childSessionId: string;
  /** The mirror's name; it labels the Subagent report. */
  readonly description: string;
  readonly handleState: SpawnedHandleState;
  /** First write wins: the one outcome of the child's turn. */
  readonly outcome: Deferred.Deferred<SubagentOutcome>;
  readonly parentLaunchTarget: AgentLaunchTarget;
  readonly parentSessionId: string;
  /** The fiber delivering the Subagent report once the outcome is in; interrupted when the link ends. */
  readonly reporter?: Fiber.Fiber<unknown>;
  /** The trimmed task text, as sent. */
  readonly task: string;
  /** The fiber projecting the child's root entry onto its mirror; interrupted when the link ends. */
  readonly projection?: Fiber.Fiber<unknown>;
};

export type SpawnedLinks = ReadonlyMap<string, SpawnedLink>;

export const linkKey = (launchTarget: AgentLaunchTarget, sessionId: string): string =>
  `${launchTarget}\u0000${sessionId}`;

export const addLink = (links: SpawnedLinks, link: SpawnedLink): SpawnedLinks =>
  new Map(links).set(linkKey(link.childLaunchTarget, link.childSessionId), link);

export const removeLink = (links: SpawnedLinks, launchTarget: AgentLaunchTarget, sessionId: string): SpawnedLinks => {
  const next = new Map(links);
  next.delete(linkKey(launchTarget, sessionId));
  return next;
};

export const linkOfChild = (
  links: SpawnedLinks,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
): SpawnedLink | undefined => links.get(linkKey(launchTarget, sessionId));

export const isLinked = (links: SpawnedLinks, launchTarget: AgentLaunchTarget, sessionId: string): boolean =>
  links.has(linkKey(launchTarget, sessionId));

export const linksOfParent = (
  links: SpawnedLinks,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
): readonly SpawnedLink[] =>
  [...links.values()].filter(link => link.parentLaunchTarget === launchTarget && link.parentSessionId === sessionId);

/** Replace the link of a child (no-op when it is gone). */
export const updateLink = (
  links: SpawnedLinks,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
  patch: Partial<SpawnedLink>,
): SpawnedLinks => {
  const link = linkOfChild(links, launchTarget, sessionId);
  return link === undefined ? links : new Map(links).set(linkKey(launchTarget, sessionId), { ...link, ...patch });
};

/**
 * Take the outcome's hand-off for `by` while it is still `open`. True when this call took it (the caller then hands the
 * outcome to the agent); false when the other party already did. Callers go through `claimOutcome` in
 * `atoms/subagentOutcome.ts`.
 */
export const claimHandle = (
  links: SpawnedLinks,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
  by: Exclude<SpawnedHandleState, 'open'>,
): [claimed: boolean, next: SpawnedLinks] => {
  const link = linkOfChild(links, launchTarget, sessionId);
  return link?.handleState === 'open'
    ? [true, updateLink(links, launchTarget, sessionId, { handleState: by })]
    : [false, links];
};

/** How deep Spawned subagent sessions may nest. A grandchild's mirror would sit in a snapshot the root's Subagent view never reads; raising this is #277's job. */
export const MAX_SPAWN_DEPTH = 1;

/** Live children one parent may have at once (a fork-bomb guard: a child session is much heavier than a request). */
export const MAX_LIVE_CHILDREN = 8;

/** 1 when `sessionId` is itself a Spawned subagent session, else 0. */
export const spawnDepth = (links: SpawnedLinks, launchTarget: AgentLaunchTarget, sessionId: string): number =>
  isLinked(links, launchTarget, sessionId) ? 1 : 0;

/** Children of a parent whose Prompt turn has not ended. */
export const liveChildCount = (links: SpawnedLinks, launchTarget: AgentLaunchTarget, sessionId: string): number =>
  linksOfParent(links, launchTarget, sessionId).filter(link => !Deferred.isDoneUnsafe(link.outcome)).length;

/** A Session History title for a child that left its link: the first line of its task. */
export const subagentHistoryTitle = (task: string): string => {
  const line = (task.split('\n').find(candidate => candidate.trim() !== '') ?? '').trim().replace(/\s+/g, ' ');
  return line.length <= 80 ? line : `${line.slice(0, 79)}…`;
};
