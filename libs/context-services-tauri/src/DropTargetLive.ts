/* oxlint-disable typescript/no-unsafe-member-access, typescript/no-unsafe-argument -- tsgolint cannot resolve @tauri-apps/api/webview types that tsc resolves */
import { DropTarget } from '@lib/context-services';
import type { DropTargetEvent } from '@lib/context-services';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { DragDropEvent } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Effect, Layer, PubSub, Stream } from 'effect';

/** Physical → logical via the window scale factor (same division as Tauri's `toLogical`; not `devicePixelRatio`, which changes with browser zoom). */
const toDropTargetEvent = (payload: DragDropEvent, scaleFactor: number): DropTargetEvent => {
  if (payload.type === 'leave') {
    return { _tag: 'leave' };
  }
  const position = { x: payload.position.x / scaleFactor, y: payload.position.y / scaleFactor };
  if (payload.type === 'over') {
    return { _tag: 'over', position };
  }
  return { _tag: payload.type, paths: payload.paths, position };
};

/**
 * Tauri Live for {@link DropTarget}: one `onDragDropEvent` listener for the layer's lifetime,
 * fanned out through a PubSub so component remounts never race listen / unlisten.
 */
export const DropTargetLive = Layer.effect(
  DropTarget,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<DropTargetEvent>();
    yield* Effect.acquireRelease(
      Effect.promise(() =>
        getCurrentWebview().onDragDropEvent((event: { readonly payload: DragDropEvent }) => {
          getCurrentWindow()
            .scaleFactor()
            .then(scaleFactor => Effect.runSync(PubSub.publish(pubsub, toDropTargetEvent(event.payload, scaleFactor))))
            .catch(() => undefined);
        }),
      ),
      unlisten => Effect.sync(unlisten),
    );
    return DropTarget.of({ events: Stream.fromPubSub(pubsub) });
  }),
);
