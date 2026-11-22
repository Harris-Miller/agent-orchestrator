import type { TrackerRef, WorkstreamSession } from '@lib/hoa-home';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';

import { adoptIntoWorkstream, orphanFromWorkstream } from './workstreams.atoms.ts';

import {
  createWorkstreamIn,
  deleteWorkstreamIn,
  setWorkstreamArchivedIn,
  startSessionInWorkstream,
  updateWorkstreamIn,
} from './workstreamActions.ts';

export const createWorkstreamActionAtoms = ({ atomRuntime }: Pick<HostRuntimeBag, 'atomRuntime'>) => {
  const createWorkstreamAtomFn = atomRuntime
    .fn((arg: { readonly name: string; readonly trackers: readonly TrackerRef[] }, get: Atom.FnContext) =>
      createWorkstreamIn(get.registry, arg.name, arg.trackers),
    )
    .pipe(Atom.keepAlive);

  const updateWorkstreamAtomFn = atomRuntime
    .fn(
      (
        arg: { readonly id: string; readonly name: string; readonly trackers: readonly TrackerRef[] },
        get: Atom.FnContext,
      ) => updateWorkstreamIn(get.registry, arg.id, { name: arg.name, trackers: arg.trackers }),
    )
    .pipe(Atom.keepAlive);

  const deleteWorkstreamAtomFn = atomRuntime
    .fn((id: string, get: Atom.FnContext) => deleteWorkstreamIn(get.registry, id))
    .pipe(Atom.keepAlive);

  const setWorkstreamArchivedAtomFn = atomRuntime
    .fn((arg: { readonly id: string; readonly archived: boolean }, get: Atom.FnContext) =>
      setWorkstreamArchivedIn(get.registry, arg.id, arg.archived),
    )
    .pipe(Atom.keepAlive);

  const adoptSessionAtomFn = atomRuntime
    .fn((arg: { readonly workstreamId: string; readonly session: WorkstreamSession }, get: Atom.FnContext) =>
      adoptIntoWorkstream(get.registry, arg.workstreamId, arg.session),
    )
    .pipe(Atom.keepAlive);

  const orphanSessionAtomFn = atomRuntime
    .fn((session: WorkstreamSession, get: Atom.FnContext) => orphanFromWorkstream(get.registry, session))
    .pipe(Atom.keepAlive);

  const startSessionInWorkstreamAtomFn = atomRuntime
    .fn((arg: { readonly workstreamId: string; readonly cwd: string }, get: Atom.FnContext) =>
      startSessionInWorkstream(get.registry, arg.workstreamId, arg.cwd),
    )
    .pipe(Atom.keepAlive);

  return {
    adoptSessionAtomFn,
    createWorkstreamAtomFn,
    deleteWorkstreamAtomFn,
    orphanSessionAtomFn,
    setWorkstreamArchivedAtomFn,
    startSessionInWorkstreamAtomFn,
    updateWorkstreamAtomFn,
  };
};
