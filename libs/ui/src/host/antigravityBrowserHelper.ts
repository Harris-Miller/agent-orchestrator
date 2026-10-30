/**
 * Materialize capture-only Antigravity `BROWSER` helper under AO home.
 */
import { antigravityAcpBrowserHelperPath, antigravityAcpRootDir, ensureHome } from '@lib/ao-home';
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';

import { ANTIGRAVITY_AUTH_URL_MARKER_PREFIX } from './antigravityAuthUrl.ts';
import { mapAntigravityFs, runAntigravityShell } from './antigravityShell.ts';

/** Shell script body for the capture-only `BROWSER` helper (prints marker, does not open). */
export const antigravityBrowserHelperScript = `#!/bin/sh
printf '%s%s\\n' '${ANTIGRAVITY_AUTH_URL_MARKER_PREFIX}' "$1" >&2
`;

/** Ensure `~/.ao/antigravity-acp/browser-helper` exists and is executable. */
export const ensureAntigravityBrowserHelper = Effect.fn('ensureAntigravityBrowserHelper')(
  function* () {
    const fs = yield* FileSystem;
    yield* mapAntigravityFs(ensureHome(), 'Antigravity home ensure failed');
    const root = yield* antigravityAcpRootDir();
    yield* mapAntigravityFs(fs.makeDirectory(root, { recursive: true }), 'Antigravity root mkdir failed');
    const helperPath = yield* antigravityAcpBrowserHelperPath();
    yield* mapAntigravityFs(
      fs.writeFileString(helperPath, antigravityBrowserHelperScript),
      'Antigravity BROWSER helper write failed',
    );
    yield* runAntigravityShell('chmod', ['+x', helperPath], 'Antigravity BROWSER helper chmod failed');
    return helperPath;
  },
  Effect.annotateLogs({ module: 'antigravityBrowserHelper' }),
);
