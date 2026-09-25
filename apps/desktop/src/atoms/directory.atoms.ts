/** Directory browser Atom fns for create-session cwd picking. */
import { Atom } from 'effect/unstable/reactivity';

import {
  joinDirectory,
  listChildDirectories,
  parentDirectory,
  resolveHomeDir,
} from '../acp/sessionDirectoryBrowser.ts';

import { acpRuntime } from './acpRuntime.atoms.ts';

export const resolveHomeDirAtomFn = acpRuntime.fn((_arg: undefined) => resolveHomeDir()).pipe(Atom.keepAlive);

export const listChildDirectoriesAtomFn = acpRuntime
  .fn((dirPath: string) => listChildDirectories(dirPath))
  .pipe(Atom.keepAlive);

export const parentDirectoryAtomFn = acpRuntime.fn((dirPath: string) => parentDirectory(dirPath)).pipe(Atom.keepAlive);

export const joinDirectoryAtomFn = acpRuntime
  .fn((arg: { childName: string; dirPath: string }) => joinDirectory(arg.dirPath, arg.childName))
  .pipe(Atom.keepAlive);
