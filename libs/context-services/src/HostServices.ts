import type { FileSystem } from 'effect/FileSystem';
import type { HttpClient } from 'effect/http/HttpClient';
import type { Path } from 'effect/Path';
import type { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import type { Analytics } from './Analytics.ts';
import type { AtomicFile } from './AtomicFile.ts';
import type { BundledResource } from './BundledResource.ts';
import type { Clipboard } from './Clipboard.ts';
import type { FileDialog } from './FileDialog.ts';
import type { Notifier } from './Notifier.ts';
import type { OpenUrl } from './OpenUrl.ts';
import type { OpenFile } from './OpenFile.ts';
import type { OS } from './OS.ts';
import type { VscodeExtension } from './VscodeExtension.ts';

/** Portable host-capability aggregate (desktop: Tauri services; VS Code: IPC Live). */
export type HostServices =
  | Analytics
  | AtomicFile
  | BundledResource
  | ChildProcessSpawner
  | Clipboard
  | FileDialog
  | FileSystem
  | HttpClient
  | Notifier
  | OpenUrl
  | OpenFile
  | OS
  | Path
  | VscodeExtension;
