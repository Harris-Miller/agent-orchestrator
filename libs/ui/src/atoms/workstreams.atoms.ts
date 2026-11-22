/**
 * Workstreams: one hoa-home document spanning launch targets, hydrated by `hydrateHarnessCaches`. A session that
 * belongs to a Workstream leaves the Sessions Page lists while Experimental: Workstreams is on; ownership persists
 * while it is off.
 */
import { adoptSession, orphanSession, WorkstreamsMalformed } from '@lib/hoa-home';
import type { Workstream, WorkstreamSession } from '@lib/hoa-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { UnifiedHistoryEntry } from '../host/acpSessionBootstrap.ts';
import { sessionEntryKey } from '../host/sessionEntryKey.ts';

import { workstreamsEnabledAtom } from './userSettings/userSettingsDocument.atoms.ts';

export const workstreamsAtom = Atom.make<readonly Workstream[]>([]).pipe(Atom.withLabel('workstreams'), Atom.keepAlive);

/** True once the file was read. Stays false when it is malformed, so writes never overwrite it. */
export const workstreamsLoadedAtom = Atom.make(false).pipe(Atom.withLabel('workstreamsLoaded'), Atom.keepAlive);

/** A Virtual session that will join a Workstream when it materializes. Keyed by blob id so a discarded blob never joins. */
export const pendingWorkstreamAtom = Atom.make<{ readonly blobId: string; readonly workstreamId: string } | null>(
  null,
).pipe(Atom.withLabel('pendingWorkstream'), Atom.keepAlive);

/** Keys (`launchTarget:sessionId`) of every session some Workstream owns, whether or not the flag is on. */
export const ownedSessionKeysAtom = Atom.make(
  (get): ReadonlySet<string> => new Set(get(workstreamsAtom).flatMap(ws => ws.sessions.map(sessionEntryKey))),
).pipe(Atom.keepAlive);

/** The keys the Sessions Page leaves out: owned sessions while the flag is on, nothing while off. */
export const workstreamOwnedKeysAtom = Atom.make((get): ReadonlySet<string> => {
  return get(workstreamsEnabledAtom) ? get(ownedSessionKeysAtom) : new Set<string>();
}).pipe(Atom.keepAlive);

/** `entries` without the sessions Workstreams own (see {@link workstreamOwnedKeysAtom}). */
export const withoutWorkstreamOwned = (
  entries: readonly UnifiedHistoryEntry[],
  owned: ReadonlySet<string>,
): readonly UnifiedHistoryEntry[] =>
  owned.size === 0 ? entries : entries.filter(entry => !owned.has(sessionEntryKey(entry)));

/**
 * Runs one file change, then mirrors the returned document into state. Fails (writing nothing) until the file was read,
 * so a malformed file is never overwritten.
 */
export const mutateWorkstreams = <E, R>(
  registry: AtomRegistry.AtomRegistry,
  change: Effect.Effect<{ readonly workstreams: readonly Workstream[] }, E, R>,
) =>
  Effect.gen(function* () {
    if (!registry.get(workstreamsLoadedAtom)) {
      return yield* new WorkstreamsMalformed({
        message: 'Workstreams file could not be read; fix or remove workstreams.json to change Workstreams.',
      });
    }
    const document = yield* change;
    registry.set(workstreamsAtom, document.workstreams);
    return document;
  });

/** Adopt: moves a session into a Workstream (out of any other). */
export const adoptIntoWorkstream = (registry: AtomRegistry.AtomRegistry, id: string, session: WorkstreamSession) =>
  mutateWorkstreams(registry, adoptSession(id, session));

/** Orphan: takes a session out of its Workstream (session delete uses it too). */
export const orphanFromWorkstream = (registry: AtomRegistry.AtomRegistry, session: WorkstreamSession) =>
  mutateWorkstreams(registry, orphanSession(session));
