import { FileDialog } from '@lib/context-services';
import { Effect } from 'effect';

/** The portable open-file dialog filtered to Workspace files; the chosen absolute path, or `undefined` when cancelled. */
export const pickWorkspaceFile = Effect.gen(function* () {
  const [picked] = yield* (yield* FileDialog).pickFiles({
    filters: [{ extensions: ['code-workspace'], name: 'Workspace file' }],
    multiple: false,
  });
  return picked;
});
