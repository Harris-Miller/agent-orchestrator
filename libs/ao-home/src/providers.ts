/**
 * Provider runtime paths under `~/.ao/providers/<launchTarget>/`.
 * The active runtime is selected by `current.json` (see `ProviderRuntimeDocument`), never by a symlink.
 */
import { Effect } from 'effect';
import { Path } from 'effect/Path';

import { resolveHome } from './home.ts';
import type { LaunchTarget } from './LaunchTarget.ts';

export const PROVIDERS_DIRNAME = 'providers' as const;
export const PROVIDER_RUNTIME_DIRNAME = 'runtime' as const;
export const PROVIDER_CURRENT_FILENAME = 'current.json' as const;
export const ANTIGRAVITY_PROVIDER_ID = 'antigravity-acp' as const;
export const PROVIDER_BROWSER_HELPER_FILENAME = 'browser-helper' as const;
export const PROVIDER_HOME_DIRNAME = 'home' as const;

/** Provider-relative runtime directory, as recorded in `current.json`. */
export const providerRuntimeRelativeDir = (version: string): string => `${PROVIDER_RUNTIME_DIRNAME}/${version}`;

export const providersRootDir = Effect.fn('providersRootDir')(function* () {
  const path = yield* Path;
  return path.join(yield* resolveHome(), PROVIDERS_DIRNAME);
});

export const providerDir = Effect.fn('providerDir')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  return path.join(yield* providersRootDir(), launchTarget);
});

/** `<provider>/runtime/<version>` — callers must validate `version` (see `isSafeRuntimeVersion`). */
export const providerRuntimeDir = Effect.fn('providerRuntimeDir')(function* (
  launchTarget: LaunchTarget,
  version: string,
) {
  const path = yield* Path;
  return path.join(yield* providerDir(launchTarget), providerRuntimeRelativeDir(version));
});

export const providerCurrentJsonPath = Effect.fn('providerCurrentJsonPath')(function* (launchTarget: LaunchTarget) {
  const path = yield* Path;
  return path.join(yield* providerDir(launchTarget), PROVIDER_CURRENT_FILENAME);
});

/** Antigravity credential / profile home (`GEMINI_HOME`). */
export const antigravityProviderHomeDir = Effect.fn('antigravityProviderHomeDir')(function* () {
  const path = yield* Path;
  const root = yield* providersRootDir();
  return path.join(root, ANTIGRAVITY_PROVIDER_ID, PROVIDER_HOME_DIRNAME);
});

/** Capture-only `BROWSER` helper, beside `runtime/` and `current.json`. */
export const antigravityProviderBrowserHelperPath = Effect.fn('antigravityProviderBrowserHelperPath')(function* () {
  const path = yield* Path;
  const root = yield* providersRootDir();
  return path.join(root, ANTIGRAVITY_PROVIDER_ID, PROVIDER_BROWSER_HELPER_FILENAME);
});
