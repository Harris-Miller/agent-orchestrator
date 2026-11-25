import type { WorkstreamSession } from '@lib/hoa-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';

import { refreshWorkspaceProject } from './workspaceFiles.atoms.ts';
import { adoptIntoWorkstream, orphanFromWorkstream } from './workstreams.atoms.ts';

import {
  createWorkstreamIn,
  deleteWorkstreamIn,
  renameWorkstreamIn,
  setWorkstreamArchivedIn,
  startSessionInWorkstream,
} from './workstreamActions.ts';

export const createWorkstreamActionAtoms = ({ atomRuntime }: Pick<HostRuntimeBag, 'atomRuntime'>) => {
  const createWorkstreamAtomFn = atomRuntime
    .fn((name: string, get: Atom.FnContext) => createWorkstreamIn(get.registry, name))
    .pipe(Atom.keepAlive);

  const renameWorkstreamAtomFn = atomRuntime
    .fn((arg: { readonly id: string; readonly name: string }, get: Atom.FnContext) =>
      renameWorkstreamIn(get.registry, arg.id, arg.name),
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
    .fn((arg: { readonly project: string; readonly workstreamId: string }, get: Atom.FnContext) =>
      refreshWorkspaceProject(get.registry, arg.project).pipe(
        Effect.andThen(startSessionInWorkstream(get.registry, arg.workstreamId, arg.project)),
      ),
    )
    .pipe(Atom.keepAlive);

  return {
    adoptSessionAtomFn,
    createWorkstreamAtomFn,
    deleteWorkstreamAtomFn,
    orphanSessionAtomFn,
    setWorkstreamArchivedAtomFn,
    startSessionInWorkstreamAtomFn,
    renameWorkstreamAtomFn,
  };
};
