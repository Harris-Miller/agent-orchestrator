/**
 * Provider launch for ACP adapters from the host adapter resource tree.
 */
import { BundledResource } from '@lib/context-services';
import { Effect } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

import { MissingLaunchPrerequisite, requireExecutableOnPath } from './findExecutableOnPath.ts';
import { requireVendorCliAuthenticated } from './vendorCliAuth.ts';

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

const adapterEntryResource = {
  'claude-agent-acp': 'acp-adapter-resources/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
  'codex-acp': 'acp-adapter-resources/node_modules/@agentclientprotocol/codex-acp/dist/index.js',
  'gemini-acp': 'acp-adapter-resources/node_modules/@lib/gemini-acp/dist/index.js',
} as const;

export type AcpAdapterLaunchTarget = keyof typeof adapterEntryResource;

const resolveAdapterEntry = Effect.fn('resolveAdapterEntry')(
  function* (launchTarget: AcpAdapterLaunchTarget) {
    const resourcePath = adapterEntryResource[launchTarget];
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

    if (launchTarget === 'codex-acp') {
      const codexPath = yield* requireExecutableOnPath('codex');
      yield* requireVendorCliAuthenticated('codex-acp', codexPath);
      yield* Effect.logDebug('Codex adapter env', { CODEX_PATH: codexPath });
      return ChildProcess.make('node', [entry], {
        ...pipedSpawnOptions,
        env: { CODEX_PATH: codexPath },
      });
    }

    if (launchTarget === 'claude-agent-acp') {
      const claudePath = yield* requireExecutableOnPath('claude');
      yield* requireVendorCliAuthenticated('claude-agent-acp', claudePath);
      yield* Effect.logDebug('Claude adapter env', { CLAUDE_CODE_EXECUTABLE: claudePath });
      return ChildProcess.make('node', [entry], {
        ...pipedSpawnOptions,
        env: { CLAUDE_CODE_EXECUTABLE: claudePath },
      });
    }

    yield* requireExecutableOnPath('gemini');
    return ChildProcess.make('node', [entry], pipedSpawnOptions);
  },
  Effect.annotateLogs({ module: 'acpAdapterCommand' }),
  Effect.tapError(error => Effect.logError('makeAcpAdapterCommand failed', error)),
);
