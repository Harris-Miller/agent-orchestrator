/**
 * Provider launch for ACP adapters from the host adapter resource tree.
 */
import { BundledResource } from '@lib/context-services';
import { Effect } from 'effect';
import { ChildProcess } from 'effect/process';

import type { AgentLaunchTarget } from './acpAdapterEntryResource.ts';
import { ACP_ADAPTER_ENTRY_RESOURCE } from './acpAdapterEntryResource.ts';
import { MissingLaunchPrerequisite, requireExecutableOnPath } from './findExecutableOnPath.ts';
import { requireVendorCliAuthenticated } from './vendorCliAuth.ts';

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

const resolveAdapterEntry = Effect.fn('resolveAdapterEntry')(
  function* (launchTarget: AgentLaunchTarget) {
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

type VendorCliAdapter = {
  readonly envKey: string;
  readonly executable: string;
  readonly launchTarget: 'claude-agent-acp' | 'codex-acp';
};

const makeVendorCliAdapterCommand = Effect.fn('makeVendorCliAdapterCommand')(function* (
  adapter: VendorCliAdapter,
  entry: string,
) {
  const vendorPath = yield* requireExecutableOnPath(adapter.executable);
  yield* requireVendorCliAuthenticated(adapter.launchTarget, vendorPath);
  yield* Effect.logDebug(`${adapter.launchTarget} adapter env`, { [adapter.envKey]: vendorPath });
  return ChildProcess.make('node', [entry], {
    ...pipedSpawnOptions,
    env: { [adapter.envKey]: vendorPath },
  });
});

/** Detect Node + vendor CLI, resolve adapter entry, return spawn command. */
export const makeAcpAdapterCommand = Effect.fn('makeAcpAdapterCommand')(
  function* (launchTarget: AgentLaunchTarget) {
    yield* Effect.logInfo('Building ACP adapter command', launchTarget);
    yield* requireExecutableOnPath('node');
    const entry = yield* resolveAdapterEntry(launchTarget);

    switch (launchTarget) {
      case 'claude-agent-acp':
        return yield* makeVendorCliAdapterCommand(
          { envKey: 'CLAUDE_CODE_EXECUTABLE', executable: 'claude', launchTarget },
          entry,
        );
      case 'codex-acp':
        return yield* makeVendorCliAdapterCommand({ envKey: 'CODEX_PATH', executable: 'codex', launchTarget }, entry);
      case 'gemini-acp': {
        yield* requireExecutableOnPath('gemini');
        return ChildProcess.make('node', [entry], pipedSpawnOptions);
      }
    }
  },
  Effect.annotateLogs({ module: 'acpAdapterCommand' }),
  Effect.tapError(error => Effect.logError('makeAcpAdapterCommand failed', error)),
);
