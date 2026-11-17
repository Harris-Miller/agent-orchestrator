/**
 * Spawned subagent session links: which `(launch target, session)` is a child the Harness started for a parent. Pure
 * map operations; the atom that holds the map is `spawnedLinksAtom`. In memory only (like credentials): after a restart
 * the child is just a session on its own launch target.
 */
import type { Deferred, Fiber } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

/** How a Spawned subagent session's Prompt turn ended; `text` is its final message (completed) or the cause. */
export type SubagentOutcome = {
  readonly status: 'cancelled' | 'completed' | 'failed';
  readonly text: string;
};

export type SpawnedLink = {
  readonly childLaunchTarget: AgentLaunchTarget;
  readonly childSessionId: string;
  /** First write wins: the one outcome of the child's turn. */
  readonly outcome: Deferred.Deferred<SubagentOutcome>;
  readonly parentLaunchTarget: AgentLaunchTarget;
  readonly parentSessionId: string;
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
