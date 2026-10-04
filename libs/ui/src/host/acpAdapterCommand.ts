/**
 * Provider launch for ACP adapters from the host adapter resource tree.
 */
import { BundledResource } from '@lib/context-services';
import { Effect } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

import type { AcpAdapterLaunchTarget } from './acpAdapterEntryResource.ts';
import { ACP_ADAPTER_ENTRY_RESOURCE } from './acpAdapterEntryResource.ts';
import { MissingLaunchPrerequisite, requireExecutableOnPath } from './findExecutableOnPath.ts';
import { requireVendorCliAuthenticated } from './vendorCliAuth.ts';

export type { AcpAdapterLaunchTarget } from './acpAdapterEntryResource.ts';

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

const resolveAdapterEntry = Effect.fn('resolveAdapterEntry')(
  function* (launchTarget: AcpAdapterLaunchTarget) {
    const resourcePath = ACP_ADAPTER_ENTRY_RESOURCE[launchTarget];
    yield* Effect.logDebug('Resolving ACP adapter resource', launchTarget, resourcePath);
    const bundled = yield* BundledResource;
    return yield* bundled.resolve(resourcePath).pipe(
      Effect.mapError(
        error =>
          new MissingLaunchPrerequisite({
            executable: resourcePath,
            message: `ACP adapter resource not found (${resourcePath}): ${error.message}`,
          }),
      ),
      Effect.tap(entry => Effect.logInfo('Resolved ACP adapter entry', launchTarget, entry)),
      Effect.tapError(error => Effect.logError('ACP adapter resource missing', launchTarget, error.message)),
    );
  },
  Effect.annotateLogs({ module: 'acpAdapterCommand' }),
);

/** Detect Node + vendor CLI, resolve adapter entry, return spawn command. */
export const makeAcpAdapterCommand = Effect.fn('makeAcpAdapterCommand')(
  function* (launchTarget: AcpAdapterLaunchTarget) {
    yield* Effect.logInfo('Building ACP adapter command', launchTarget);
    yield* requireExecutableOnPath('node');
    const entry = yield* resolveAdapterEntry(launchTarget);

    switch (launchTarget) {
      case 'claude-agent-acp': {
        const claudePath = yield* requireExecutableOnPath('claude');
        yield* requireVendorCliAuthenticated('claude-agent-acp', claudePath);
        yield* Effect.logDebug('Claude adapter env', { CLAUDE_CODE_EXECUTABLE: claudePath });
        return ChildProcess.make('node', [entry], {
          ...pipedSpawnOptions,
          env: { CLAUDE_CODE_EXECUTABLE: claudePath },
        });
      }
      case 'codex-acp': {
        const codexPath = yield* requireExecutableOnPath('codex');
        yield* requireVendorCliAuthenticated('codex-acp', codexPath);
        yield* Effect.logDebug('Codex adapter env', { CODEX_PATH: codexPath });
        return ChildProcess.make('node', [entry], {
          ...pipedSpawnOptions,
          env: { CODEX_PATH: codexPath },
        });
      }
      case 'gemini-acp': {
        yield* requireExecutableOnPath('gemini');
        return ChildProcess.make('node', [entry], pipedSpawnOptions);
      }
    }
  },
  Effect.annotateLogs({ module: 'acpAdapterCommand' }),
  Effect.tapError(error => Effect.logError('makeAcpAdapterCommand failed', error)),
);
