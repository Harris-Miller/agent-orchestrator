import type { FileSystem } from 'effect/FileSystem';
import type { Path } from 'effect/Path';
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner';

import type { OS } from './OS.ts';

/** Portable host-capability aggregate (desktop: Tauri services; VS Code: IPC Live). */
export type HostServices = ChildProcessSpawner | FileSystem | OS | Path;
