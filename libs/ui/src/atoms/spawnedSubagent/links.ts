/**
 * Spawned subagent links (internal to the Spawned subagent module): which `(launch target, session)` is a child the
 * Harness started for a parent, plus the live-children cap that guards spawning. In memory only (like credentials; ADR 0011): while
 * this app run knows a child it is never listed in Session History or Import; after a restart it is not a Tracked session. The read half (`subagentLinksAtom`, `isChild`,
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
  /**
   * The child's own final state, once its Prompt turn ended. The mirror's Work state is stamped from it only when the
   * child has no live descendants (`stamped`); the last descendant to settle stamps it for its ancestors.
   */
  readonly finish?: { readonly outcome: SubagentOutcome; readonly stamped: boolean; readonly stopReason?: string };
  /** The mirror's name; it labels the Subagent report. */
  readonly description: string;
  readonly handleState: SpawnedHandleState;
  /**
   * The launch target whose snapshot holds this child's mirror: the launch target of the link's root ancestor (the
   * Selected session; ADR 0015). For a direct child of the Selected session it equals `parentLaunchTarget`.
   */
  readonly mirrorLaunchTarget: AgentLaunchTarget;
  /** First write wins: the one outcome of the child's turn. */
  readonly outcome: Deferred.Deferred<SubagentOutcome>;
  readonly parentLaunchTarget: AgentLaunchTarget;
  readonly parentSessionId: string;
  /** The root-most (Selected) session this link descends from; its launch target is `mirrorLaunchTarget`. */
  readonly rootSessionId: string;
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

/** The child's session ref, from anything that names it (a `SpawnedLink` or `ChildMeta`). */
export const childRef = (named: Pick<SpawnedLink, 'childLaunchTarget' | 'childSessionId'>): SessionRef => ({
  launchTarget: named.childLaunchTarget,
  sessionId: named.childSessionId,
});

/** The parent's session ref (the direct parent), from a `SpawnedLink`. */
export const parentRef = (link: Pick<SpawnedLink, 'parentLaunchTarget' | 'parentSessionId'>): SessionRef => ({
  launchTarget: link.parentLaunchTarget,
  sessionId: link.parentSessionId,
});

const linkKey = (session: SessionRef): string => `${session.launchTarget}\u0000${session.sessionId}`;

const linksAtom = Atom.make<LinkMap>(new Map()).pipe(Atom.withLabel('spawnedLinks'), Atom.keepAlive);

/**
 * Every Spawned subagent session ever linked this app run, never pruned (ending a link does not remove it): the hide key
 * for Session History and Import, so a child never becomes a top-level Session. Memory only.
 */
export interface SpawnedChildren {
  readonly keys: ReadonlySet<string>;
}

const spawnedChildrenAtom = Atom.make<SpawnedChildren>({ keys: new Set<string>() }).pipe(
  Atom.withLabel('spawnedChildren'),
  Atom.keepAlive,
);

/** Read-only view of {@link spawnedChildrenAtom}; the only writer is `reserveSlot`'s `register`. */
export const spawnedChildrenSnapshotAtom: Atom.Atom<SpawnedChildren> = spawnedChildrenAtom;

/** True for a session that was ever a Spawned subagent session this app run, whether or not its link is still live. */
export const wasSpawnedChildIn = (children: SpawnedChildren, session: SessionRef): boolean =>
  children.keys.has(linkKey(session));

/** Spawns past their cap check but without a link yet, per parent: they count toward the live-children cap. */
const pendingSpawnsAtom = Atom.make<ReadonlyMap<string, number>>(new Map()).pipe(
  Atom.withLabel('pendingSpawns'),
  Atom.keepAlive,
);

/** The same reservations, per root-most (Selected) session: they count toward the live-descendants cap. */
const pendingByRootAtom = Atom.make<ReadonlyMap<string, number>>(new Map()).pipe(
  Atom.withLabel('pendingSpawnsByRoot'),
  Atom.keepAlive,
);

/** Read-only view for derived atoms (e.g. History). Writers go through the functions below. */
export const subagentLinksAtom: Atom.Atom<SubagentLinks> = linksAtom as unknown as Atom.Atom<SubagentLinks>;

/** How deep Spawned subagent sessions may nest: links up to the Selected session (its direct children are depth 1). */
export const MAX_SPAWN_DEPTH = 3;

/** Live children one parent may have at once (a fork-bomb guard: a child session is much heavier than a request). */
export const MAX_LIVE_CHILDREN = 8;

/** Live descendants (children, their children, ...) one Selected session may have at once. */
export const MAX_LIVE_DESCENDANTS = 24;

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

/** Links between `session` and its root-most (Selected) session: 0 for a session that is not a child. */
export const depthOf = (registry: Registry, session: SessionRef): number => {
  let depth = 0;
  let link = linkOf(registry, session);
  // Cycle/runaway guard: bound the walk just past the max depth.
  while (link !== undefined && depth <= MAX_SPAWN_DEPTH + 1) {
    depth += 1;
    link = linkOf(registry, parentRef(link));
  }
  return depth;
};

/** True when a child of `parent` would be deeper than {@link MAX_SPAWN_DEPTH}. */
export const atMaxSpawnDepth = (registry: Registry, parent: SessionRef): boolean =>
  depthOf(registry, parent) + 1 > MAX_SPAWN_DEPTH;

/** The root-most session `session` descends from through live links (itself when it is not a child). */
export const rootOf = (registry: Registry, session: SessionRef): SessionRef => {
  const link = linkOf(registry, session);
  return link === undefined ? session : { launchTarget: link.mirrorLaunchTarget, sessionId: link.rootSessionId };
};

const isUnderRoot = (link: SpawnedLink, root: SessionRef): boolean =>
  link.mirrorLaunchTarget === root.launchTarget && link.rootSessionId === root.sessionId;

/** Links of a root session's descendants whose Prompt turn has not ended, at any depth. */
const liveDescendantCount = (registry: Registry, root: SessionRef): number =>
  allIn(registry).filter(link => isUnderRoot(link, root) && !Deferred.isDoneUnsafe(link.outcome)).length;

/** Every live or finished link below `session`, at any depth, children before their parents (deepest first). */
export const descendantsOf = (registry: Registry, session: SessionRef): readonly SpawnedLink[] => {
  const out: SpawnedLink[] = [];
  const visit = (parent: SessionRef, seen: ReadonlySet<string>) => {
    for (const link of childrenOf(registry, parent)) {
      const child = childRef(link);
      if (!seen.has(linkKey(child))) {
        visit(child, new Set(seen).add(linkKey(child)));
        out.push(link);
      }
    }
  };
  visit(session, new Set([linkKey(session)]));
  return out;
};

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

/** Which cap a spawn under `parent` would exceed, if any (live + reserved, per parent and per root-most session). */
export const capReached = (registry: Registry, parent: SessionRef): 'children' | 'descendants' | undefined => {
  const root = rootOf(registry, parent);
  if (slotsInUse(registry, parent) >= MAX_LIVE_CHILDREN) {
    return 'children';
  }
  return liveDescendantCount(registry, root) + (registry.get(pendingByRootAtom).get(linkKey(root)) ?? 0) >=
    MAX_LIVE_DESCENDANTS
    ? 'descendants'
    : undefined;
};

/**
 * Atomic cap check + reservation. `undefined` when the parent already has MAX_LIVE_CHILDREN (live + reserved) or its
 * root-most session MAX_LIVE_DESCENDANTS; {@link capReached} says which. The check and the reservation are one
 * synchronous step.
 */
export const reserveSlot = (registry: Registry, parent: SessionRef): Slot | undefined => {
  if (capReached(registry, parent) !== undefined) {
    return undefined;
  }
  const key = linkKey(parent);
  const root = rootOf(registry, parent);
  const rootKey = linkKey(root);
  const adjustPending = (delta: 1 | -1) => {
    registry.update(pendingSpawnsAtom, pending => new Map(pending).set(key, (pending.get(key) ?? 0) + delta));
    registry.update(pendingByRootAtom, pending => new Map(pending).set(rootKey, (pending.get(rootKey) ?? 0) + delta));
  };
  adjustPending(1);
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
        mirrorLaunchTarget: root.launchTarget,
        outcome: Deferred.makeUnsafe<SubagentOutcome>(),
        parentLaunchTarget: parent.launchTarget,
        parentSessionId: parent.sessionId,
        rootSessionId: root.sessionId,
        task,
      };
      registry.update(linksAtom, links => new Map(links).set(linkKey(child), link));
      registry.update(spawnedChildrenAtom, children => ({ keys: new Set(children.keys).add(linkKey(child)) }));
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

/** Record a child's final state on its link (no-op when the link is gone), and whether its mirror is already stamped. */
export const recordFinish = (
  registry: Registry,
  child: SessionRef,
  finish: NonNullable<SpawnedLink['finish']>,
): void => {
  registry.update(linksAtom, links => {
    const link = links.get(linkKey(child));
    return link === undefined ? links : new Map(links).set(linkKey(child), { ...link, finish });
  });
};

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
