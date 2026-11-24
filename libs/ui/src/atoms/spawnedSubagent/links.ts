/**
 * Spawned subagent links (internal to the Spawned subagent module): which `(launch target, session)` is a child the
 * Harness started for a parent, plus the live-children cap that guards spawning. In memory only (like credentials): after
 * a restart the child is just a session on its own launch target. The read half (`subagentLinksAtom`, `isChild`,
 * `isChildIn`, `wasSpawnedChildIn`) is public through `index.ts`; `backendState.atoms.ts` imports it from here (the barrel would cycle).
 */
import { Deferred, Effect, Fiber } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { AgentLaunchTarget, SessionRef } from '../../host/agentLaunchTarget.ts';

type Registry = AtomRegistry.AtomRegistry;

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

declare const linksBrand: unique symbol;
/** Opaque snapshot of all links: readable only through `isChildIn`. */
export interface SubagentLinks {
  readonly [linksBrand]: never;
}

type LinkMap = ReadonlyMap<string, SpawnedLink>;

const linkKey = (session: SessionRef): string => `${session.launchTarget}\u0000${session.sessionId}`;

const linksAtom = Atom.make<LinkMap>(new Map()).pipe(Atom.withLabel('spawnedLinks'), Atom.keepAlive);

/**
 * Every Spawned subagent session ever linked this app run, never pruned (ending a link does not remove it): the hide key
 * for Session History, so a child never becomes a top-level Session. Memory only.
 */
const spawnedChildrenAtom = Atom.make<ReadonlyMap<string, true>>(new Map()).pipe(
  Atom.withLabel('spawnedChildren'),
  Atom.keepAlive,
);

declare const childrenBrand: unique symbol;
/** Opaque snapshot of every child ever linked: readable only through `wasSpawnedChildIn`. */
export interface SpawnedChildren {
  readonly [childrenBrand]: never;
}

export const spawnedChildrenSnapshotAtom: Atom.Atom<SpawnedChildren> =
  spawnedChildrenAtom as unknown as Atom.Atom<SpawnedChildren>;

/** True for a session that was ever a Spawned subagent session this app run, whether or not its link is still live. */
export const wasSpawnedChildIn = (children: SpawnedChildren, session: SessionRef): boolean =>
  (children as unknown as ReadonlyMap<string, true>).has(linkKey(session));

/** Spawns past their cap check but without a link yet, per parent: they count toward the live-children cap. */
const pendingSpawnsAtom = Atom.make<ReadonlyMap<string, number>>(new Map()).pipe(
  Atom.withLabel('pendingSpawns'),
  Atom.keepAlive,
);

/** Read-only view for derived atoms (e.g. History). Writers go through the functions below. */
export const subagentLinksAtom: Atom.Atom<SubagentLinks> = linksAtom as unknown as Atom.Atom<SubagentLinks>;

/** How deep Spawned subagent sessions may nest. A grandchild's mirror would sit in a snapshot the root's Subagent view never reads; raising this is #277's job. */
const MAX_SPAWN_DEPTH = 1;

/** Live children one parent may have at once (a fork-bomb guard: a child session is much heavier than a request). */
export const MAX_LIVE_CHILDREN = 8;

const allIn = (registry: Registry): readonly SpawnedLink[] => [...registry.get(linksAtom).values()];

const isChildOf = (link: SpawnedLink, parent: SessionRef): boolean =>
  link.parentLaunchTarget === parent.launchTarget && link.parentSessionId === parent.sessionId;

export const allLinks = (registry: Registry): readonly SpawnedLink[] => allIn(registry);

export const childrenOf = (registry: Registry, parent: SessionRef): readonly SpawnedLink[] =>
  allIn(registry).filter(link => isChildOf(link, parent));

export const linkOf = (registry: Registry, child: SessionRef): SpawnedLink | undefined =>
  registry.get(linksAtom).get(linkKey(child));

export const isChild = (registry: Registry, session: SessionRef): boolean =>
  registry.get(linksAtom).has(linkKey(session));

export const isChildIn = (links: SubagentLinks, session: SessionRef): boolean =>
  (links as unknown as LinkMap).has(linkKey(session));

/** True when `parent` is itself a Spawned subagent session (it may not start subagents of its own). */
export const atMaxSpawnDepth = (registry: Registry, parent: SessionRef): boolean =>
  (isChild(registry, parent) ? 1 : 0) >= MAX_SPAWN_DEPTH;

/** Children of a parent whose Prompt turn has not ended. */
const liveChildCount = (registry: Registry, parent: SessionRef): number =>
  childrenOf(registry, parent).filter(link => !Deferred.isDoneUnsafe(link.outcome)).length;

/** Live children plus reserved slots of a parent. */
export const slotsInUse = (registry: Registry, parent: SessionRef): number =>
  liveChildCount(registry, parent) + (registry.get(pendingSpawnsAtom).get(linkKey(parent)) ?? 0);

export interface Slot {
  /** Write the link under the slot's parent and consume the slot. Throws if the slot was already registered or released. */
  readonly register: (init: {
    readonly child: SessionRef;
    readonly description: string;
    readonly task: string;
  }) => SpawnedLink;
  /** Free the reservation; idempotent; no-op after `register`. */
  readonly release: () => void;
}

/** Atomic cap check + reservation. `undefined` when the parent already has MAX_LIVE_CHILDREN (live + reserved). */
export const reserveSlot = (registry: Registry, parent: SessionRef): Slot | undefined => {
  const key = linkKey(parent);
  const adjustPending = (delta: 1 | -1) => {
    registry.update(pendingSpawnsAtom, pending => new Map(pending).set(key, (pending.get(key) ?? 0) + delta));
  };
  const taken = registry.modify(pendingSpawnsAtom, pending => {
    const ok = liveChildCount(registry, parent) + (pending.get(key) ?? 0) < MAX_LIVE_CHILDREN;
    return [ok, ok ? new Map(pending).set(key, (pending.get(key) ?? 0) + 1) : pending] as const;
  });
  if (!taken) {
    return undefined;
  }
  let spent = false;
  const spend = () => {
    if (spent) {
      throw new Error('Slot already registered or released');
    }
    spent = true;
  };
  return {
    register: ({ child, description, task }) => {
      spend();
      const link: SpawnedLink = {
        childLaunchTarget: child.launchTarget,
        childSessionId: child.sessionId,
        description,
        handleState: 'open',
        outcome: Deferred.makeUnsafe<SubagentOutcome>(),
        parentLaunchTarget: parent.launchTarget,
        parentSessionId: parent.sessionId,
        task,
      };
      registry.update(linksAtom, links => new Map(links).set(linkKey(child), link));
      registry.update(spawnedChildrenAtom, children => new Map(children).set(linkKey(child), true));
      adjustPending(-1);
      return link;
    },
    release: () => {
      if (spent) {
        return;
      }
      spent = true;
      adjustPending(-1);
    },
  };
};

/** Take the outcome's hand-off for `by` while it is still `open`; first write wins. True when this call took it. */
export const claimHandle = (registry: Registry, child: SessionRef, by: Exclude<SpawnedHandleState, 'open'>): boolean =>
  registry.modify(linksAtom, links => {
    const link = links.get(linkKey(child));
    return link?.handleState === 'open'
      ? ([true, new Map(links).set(linkKey(child), { ...link, handleState: by })] as const)
      : ([false, links] as const);
  });

/** Record a fiber on a child's link (no-op when the link is gone). */
export const attach = (
  registry: Registry,
  child: SessionRef,
  fibers: { readonly projection: Fiber.Fiber<unknown> } | { readonly reporter: Fiber.Fiber<unknown> },
): void => {
  registry.update(linksAtom, links => {
    const link = links.get(linkKey(child));
    return link === undefined ? links : new Map(links).set(linkKey(child), { ...link, ...fibers });
  });
};

/** End a child's link: remove it, then interrupt its projection and reporter. Returns the removed link. */
export const end = (registry: Registry, child: SessionRef): Effect.Effect<SpawnedLink | undefined> =>
  Effect.gen(function* () {
    const link = linkOf(registry, child);
    if (link === undefined) {
      return undefined;
    }
    registry.update(linksAtom, links => {
      const next = new Map(links);
      next.delete(linkKey(child));
      return next;
    });
    if (link.projection !== undefined) {
      yield* Fiber.interrupt(link.projection);
    }
    if (link.reporter !== undefined) {
      yield* Fiber.interrupt(link.reporter);
    }
    return link;
  });
