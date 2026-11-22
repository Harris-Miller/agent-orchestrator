/**
 * Workstreams: one hoa-home document spanning launch targets, hydrated by `hydrateHarnessCaches`. A session that
 * belongs to a Workstream leaves the Sessions Page lists while Experimental: Workstreams is on; ownership persists
 * while it is off.
 */
import { adoptSession, orphanSession, removeSessionEverywhere as removeSessionEverywhereFromFile } from '@lib/hoa-home';
import type { Workstream, WorkstreamSession } from '@lib/hoa-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { UnifiedHistoryEntry } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { sessionEntryKey } from '../host/sessionEntryKey.ts';

import { workstreamsEnabledAtom } from './userSettings/userSettingsDocument.atoms.ts';

export const workstreamsAtom = Atom.make<readonly Workstream[]>([]).pipe(Atom.withLabel('workstreams'), Atom.keepAlive);

/** True once the file was read. Stays false when it is malformed, so writes never overwrite it. */
export const workstreamsLoadedAtom = Atom.make(false).pipe(Atom.withLabel('workstreamsLoaded'), Atom.keepAlive);

/** A Virtual session that will join a Workstream when it materializes. Keyed by blob id so a discarded blob never joins. */
export const pendingWorkstreamAtom = Atom.make<{ readonly blobId: string; readonly workstreamId: string } | null>(
  null,
).pipe(Atom.withLabel('pendingWorkstream'), Atom.keepAlive);

const keyOf = (session: WorkstreamSession): string => `${session.launchTarget}:${session.sessionId}`;

/** Keys (`launchTarget:sessionId`) of every session some Workstream owns, whether or not the flag is on. */
export const ownedSessionKeysAtom = Atom.make(
  (get): ReadonlySet<string> => new Set(get(workstreamsAtom).flatMap(ws => ws.sessions.map(keyOf))),
).pipe(Atom.keepAlive);

/** The keys the Sessions Page hides: owned sessions while the flag is on, nothing while off. */
export const hiddenFromSessionsPageKeysAtom = Atom.make((get): ReadonlySet<string> => {
  return get(workstreamsEnabledAtom) ? get(ownedSessionKeysAtom) : new Set<string>();
}).pipe(Atom.keepAlive);

/** `entries` without the sessions the Sessions Page hides (see {@link hiddenFromSessionsPageKeysAtom}). */
export const withoutWorkstreamOwned = (
  entries: readonly UnifiedHistoryEntry[],
  hidden: ReadonlySet<string>,
): readonly UnifiedHistoryEntry[] =>
  hidden.size === 0 ? entries : entries.filter(entry => !hidden.has(sessionEntryKey(entry)));

/** The Workstream that owns a session, if any. */
export const owningWorkstream = (
  workstreams: readonly Workstream[],
  session: { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string },
): Workstream | undefined => workstreams.find(ws => ws.sessions.some(item => keyOf(item) === sessionEntryKey(session)));

/** Writes through to disk and state. No-op until the file was read; failures only warn. */
const applyDocument = (registry: AtomRegistry.AtomRegistry, workstreams: readonly Workstream[]): void => {
  registry.set(workstreamsAtom, workstreams);
};

/** Adds a session to a Workstream (removing it from any other). No-op until loaded; failures only warn. */
export const joinWorkstream = Effect.fn('joinWorkstream')(
  function* (registry: AtomRegistry.AtomRegistry, workstreamId: string, session: WorkstreamSession) {
    if (!registry.get(workstreamsLoadedAtom)) return;
    applyDocument(registry, (yield* adoptSession(workstreamId, session)).workstreams);
  },
  Effect.catchCause(cause => Effect.logWarning('join workstream failed', cause)),
);

/** Takes a session out of its Workstream (it returns to the Sessions Page). No-op until loaded; failures only warn. */
export const leaveWorkstream = Effect.fn('leaveWorkstream')(
  function* (registry: AtomRegistry.AtomRegistry, session: WorkstreamSession) {
    if (!registry.get(workstreamsLoadedAtom)) return;
    applyDocument(registry, (yield* orphanSession(session)).workstreams);
  },
  Effect.catchCause(cause => Effect.logWarning('leave workstream failed', cause)),
);

/** Session delete: drops the session from every Workstream. */
export const removeSessionEverywhere = Effect.fn('removeSessionEverywhere')(
  function* (registry: AtomRegistry.AtomRegistry, session: WorkstreamSession) {
    if (!registry.get(workstreamsLoadedAtom)) return;
    applyDocument(registry, (yield* removeSessionEverywhereFromFile(session)).workstreams);
  },
  Effect.catchCause(cause => Effect.logWarning('remove session from workstreams failed', cause)),
);
