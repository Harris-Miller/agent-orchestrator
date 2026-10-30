import type { FileSystem } from 'effect/FileSystem';
import type { HttpClient } from 'effect/http/HttpClient';
import type { Path } from 'effect/Path';
import type { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import type { BundledResource } from './BundledResource.ts';
import type { Clipboard } from './Clipboard.ts';
import type { FileDialog } from './FileDialog.ts';
import type { OS } from './OS.ts';

/** Portable host-capability aggregate (desktop: Tauri services; VS Code: IPC Live). */
export type HostServices =
  BundledResource | ChildProcessSpawner | Clipboard | FileDialog | FileSystem | HttpClient | OS | Path;
