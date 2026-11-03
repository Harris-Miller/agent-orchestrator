import type { Stream } from 'effect';
import { Context } from 'effect';

/** Window-relative logical pixel position of a drag over the Host window. */
export type DropTargetPosition = { readonly x: number; readonly y: number };

/** Lifecycle of OS files dragged onto the Host window; `paths` are absolute. */
export type DropTargetEvent =
  | { readonly _tag: 'drop'; readonly paths: readonly string[]; readonly position: DropTargetPosition }
  | { readonly _tag: 'enter'; readonly paths: readonly string[]; readonly position: DropTargetPosition }
  | { readonly _tag: 'leave' }
  | { readonly _tag: 'over'; readonly position: DropTargetPosition };

/**
 * Portable OS drag-and-drop feed. Needed where the webview gets no DOM `drop` for OS files
 * (desktop Tauri); the VS Code Host reports an empty stream.
 */
export interface DropTarget {
  readonly events: Stream.Stream<DropTargetEvent>;
}

export const DropTarget = Context.Service<DropTarget>('DropTarget');
