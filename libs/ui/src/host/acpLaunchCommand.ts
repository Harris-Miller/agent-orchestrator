/**
 * Provider ACP launch command: adapter resource entry (`node` + shim) or
 * native Vendor CLI (`cursor-agent acp`).
 */
import { BundledResource, OS } from '@lib/context-services';
import { Effect } from 'effect';
import { ChildProcess } from 'effect/process';

import { ACP_ADAPTER_ENTRY_RESOURCE } from './acpAdapterEntryResource.ts';
import type { AcpAdapterLaunchTarget, AgentLaunchTarget } from './agentLaunchTarget.ts';
import { MissingLaunchPrerequisite, requireExecutableOnPath } from './findExecutableOnPath.ts';
import { requireVendorCliAuthenticated } from './vendorCliAuth.ts';

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

/** Root CLI auth flags before `acp` — docs: `agent --api-key "$CURSOR_API_KEY" acp`. */
const cursorAcpArgs = (env: Readonly<Record<string, string | undefined>>): readonly string[] => {
  const args: string[] = [];
  const apiKey = env.CURSOR_API_KEY;
  if (apiKey !== undefined && apiKey.length > 0) {
    args.push('--api-key', apiKey);
  }
  const authToken = env.CURSOR_AUTH_TOKEN;
  if (authToken !== undefined && authToken.length > 0) {
    args.push('--auth-token', authToken);
  }
  args.push('acp');
  return args;
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
  Effect.annotateLogs({ module: 'acpLaunchCommand' }),
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

const makeCursorNativeCommand = Effect.fn('makeCursorNativeCommand')(function* () {
  const vendorPath = yield* requireExecutableOnPath('cursor-agent');
  yield* requireVendorCliAuthenticated('cursor-acp', vendorPath);
  const os = yield* OS;
  return ChildProcess.make('cursor-agent', [...cursorAcpArgs(os.env())], pipedSpawnOptions);
});

/** Resolve PATH/auth prerequisites and return the ACP spawn command for a launch target. */
export const makeAcpLaunchCommand = Effect.fn('makeAcpLaunchCommand')(
  function* (launchTarget: AgentLaunchTarget) {
    yield* Effect.logInfo('Building ACP launch command', launchTarget);

    if (launchTarget === 'cursor-acp') {
      return yield* makeCursorNativeCommand();
    }

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
  Effect.annotateLogs({ module: 'acpLaunchCommand' }),
  Effect.tapError(error => Effect.logError('makeAcpLaunchCommand failed', error)),
);
