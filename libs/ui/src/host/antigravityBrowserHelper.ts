/**
 * Materialize capture-only Antigravity `BROWSER` helper under AO home.
 */
import { antigravityAcpBrowserHelperPath, antigravityAcpRootDir, ensureHome } from '@lib/ao-home';
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';

import { antigravityBrowserHelperScript } from './antigravityAuthUrl.ts';
import { asAntigravityMissingPrerequisite, runAntigravityShell } from './antigravityShell.ts';

/** Ensure `~/.ao/antigravity-acp/browser-helper` exists and is executable. */
export const ensureAntigravityBrowserHelper = Effect.fn('ensureAntigravityBrowserHelper')(
  function* () {
    const fs = yield* FileSystem;
    yield* ensureHome().pipe(
      Effect.mapError(error => asAntigravityMissingPrerequisite(`Antigravity home ensure failed: ${String(error)}`)),
    );
    const root = yield* antigravityAcpRootDir();
    yield* fs
      .makeDirectory(root, { recursive: true })
      .pipe(
        Effect.mapError(error => asAntigravityMissingPrerequisite(`Antigravity root mkdir failed: ${String(error)}`)),
      );
    const helperPath = yield* antigravityAcpBrowserHelperPath();
    yield* fs
      .writeFileString(helperPath, antigravityBrowserHelperScript)
      .pipe(
        Effect.mapError(error =>
          asAntigravityMissingPrerequisite(`Antigravity BROWSER helper write failed: ${String(error)}`),
        ),
      );
    yield* runAntigravityShell('chmod', ['+x', helperPath], 'Antigravity BROWSER helper chmod failed');
    return helperPath;
  },
  Effect.annotateLogs({ module: 'antigravityBrowserHelper' }),
);
