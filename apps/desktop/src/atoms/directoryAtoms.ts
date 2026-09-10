/** Directory browser Atom fns for create-session cwd picking. */
import { Atom } from 'effect/unstable/reactivity';

import {
  joinDirectory,
  listChildDirectories,
  parentDirectory,
  resolveHomeDir,
} from '../acp/sessionDirectoryBrowser.ts';

import { acpRuntime } from './acpRuntime.ts';

export const resolveHomeDirFn = acpRuntime.fn((_arg: undefined) => resolveHomeDir()).pipe(Atom.keepAlive);

export const listChildDirectoriesFn = acpRuntime
  .fn((dirPath: string) => listChildDirectories(dirPath))
  .pipe(Atom.keepAlive);

export const parentDirectoryFn = acpRuntime.fn((dirPath: string) => parentDirectory(dirPath)).pipe(Atom.keepAlive);

export const joinDirectoryFn = acpRuntime
  .fn((arg: { childName: string; dirPath: string }) => joinDirectory(arg.dirPath, arg.childName))
  .pipe(Atom.keepAlive);
