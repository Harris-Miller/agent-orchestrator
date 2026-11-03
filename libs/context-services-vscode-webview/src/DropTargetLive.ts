import { DropTarget } from '@lib/context-services';
import { Layer, Stream } from 'effect';

/** VS Code Live for {@link DropTarget}: the webview receives OS and editor drops as DOM events, so no stream. */
export const DropTargetLive = Layer.succeed(DropTarget, {
  events: Stream.empty,
});
