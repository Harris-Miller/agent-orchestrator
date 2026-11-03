/* oxlint-disable typescript/no-unsafe-member-access, typescript/no-unsafe-argument -- tsgolint cannot resolve @tauri-apps/api/webview types that tsc resolves */
import { DropTarget } from '@lib/context-services';
import type { DropTargetEvent } from '@lib/context-services';
import type { DragDropEvent } from '@tauri-apps/api/webview';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Effect, Layer, PubSub, Queue, Stream } from 'effect';

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
 * Tauri Live for {@link DropTarget}: one `onDragDropEvent` listener for the layer's lifetime.
 * Events go through a Queue drained in order, so the async scale-factor lookup can't reorder
 * `enter` / `over` / `leave` / `drop`; the PubSub then fans them out.
 */
export const DropTargetLive = Layer.effect(
  DropTarget,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<DropTargetEvent>();
    const queue = yield* Queue.unbounded<DragDropEvent>();

    yield* Effect.forkScoped(
      Effect.forever(
        Effect.gen(function* () {
          const payload = yield* Queue.take(queue);
          const scaleFactor = yield* Effect.promise(() => getCurrentWindow().scaleFactor());
          yield* PubSub.publish(pubsub, toDropTargetEvent(payload, scaleFactor));
        }),
      ),
    );

    yield* Effect.acquireRelease(
      Effect.promise(() =>
        getCurrentWebview().onDragDropEvent((event: { readonly payload: DragDropEvent }) => {
          Effect.runSync(Queue.offer(queue, event.payload));
        }),
      ),
      unlisten => Effect.sync(unlisten),
    );

    return DropTarget.of({ events: Stream.fromPubSub(pubsub) });
  }),
);
