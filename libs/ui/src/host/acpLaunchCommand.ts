/**
 * Provider ACP launch command: adapter resource entry (`node` + shim),
 * native Vendor CLI (`cursor-agent acp`), or managed Antigravity binary.
 */
import {
  ANTIGRAVITY_ACP_SPAWN_NAME,
  ensureAntigravityProviderBrowserHelper,
  ensureAntigravityProviderHome,
} from '@lib/hoa-home';
import { MAX_SUBAGENT_WAIT_MS } from '@lib/hub/protocol';
import { OS } from '@lib/context-services';
import { Effect, Redacted } from 'effect';
import { Path } from 'effect/Path';
import { ChildProcess } from 'effect/process';

import type { AcpAdapterLaunchTarget, AgentLaunchTarget } from './agentLaunchTarget.ts';
import { buildAntigravitySpawnEnv } from './antigravityEnv.ts';
import { mapAntigravityFs } from './antigravityShell.ts';
import { MissingLaunchPrerequisite, requireExecutableOnPath } from './findExecutableOnPath.ts';
import { ANTIGRAVITY_HARNESS_MEMBER, npmAdapterEntryRelativePath, resolveActiveRuntime } from './providerRuntime.ts';
import { requireVendorCliAuthenticated } from './vendorCliAuth.ts';
import { annotateLaunchTargetLogs } from './sessionTelemetry.ts';

/** Claude's per-request MCP timer (default 60 s) must outlast the foreground subagent bound, or the call dies first. */
const CLAUDE_MCP_TOOL_TIMEOUT_MS = MAX_SUBAGENT_WAIT_MS + 30_000;

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

const antigravitySpawnOptions = {
  ...pipedSpawnOptions,
  stderr: 'pipe' as const,
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

/** Adapter entry inside the active runtime (`~/.hoa/providers/<id>/current.json`), re-read on every spawn. */
const resolveAdapterEntry = Effect.fn('resolveAdapterEntry')(
  function* (launchTarget: AcpAdapterLaunchTarget) {
    const path = yield* Path;
    const active = yield* resolveActiveRuntime(launchTarget);
    const entry = path.join(active.runtimeDir, npmAdapterEntryRelativePath(launchTarget));
    yield* Effect.logInfo('Resolved ACP adapter entry').pipe(
      Effect.annotateLogs({ adapter_version: active.version, entry: Redacted.make(entry) }),
      annotateLaunchTargetLogs(launchTarget),
    );
    return entry;
  },
  Effect.annotateLogs({ module: 'acpLaunchCommand' }),
);

type VendorCliAdapter = {
  readonly envKey: string;
  /** Extra adapter env beyond the vendor CLI path. */
  readonly extraEnv?: Readonly<Record<string, string>>;
  readonly executable: string;
  readonly launchTarget: 'claude-agent-acp' | 'codex-acp';
};

const makeVendorCliAdapterCommand = Effect.fn('makeVendorCliAdapterCommand')(function* (
  adapter: VendorCliAdapter,
  entry: string,
) {
  const vendorPath = yield* requireExecutableOnPath(adapter.executable);
  yield* requireVendorCliAuthenticated(adapter.launchTarget, vendorPath);
  yield* Effect.logDebug('adapter env', { [adapter.envKey]: Redacted.make(vendorPath) }).pipe(
    annotateLaunchTargetLogs(adapter.launchTarget),
  );
  return ChildProcess.make('node', [entry], {
    ...pipedSpawnOptions,
    env: { ...adapter.extraEnv, [adapter.envKey]: vendorPath },
  });
});

const makeCursorNativeCommand = Effect.fn('makeCursorNativeCommand')(function* () {
  const vendorPath = yield* requireExecutableOnPath('cursor-agent');
  yield* requireVendorCliAuthenticated('cursor-acp', vendorPath);
  const os = yield* OS;
  return ChildProcess.make('cursor-agent', [...cursorAcpArgs(os.env())], pipedSpawnOptions);
});

const makeAntigravityCommand = Effect.fn('makeAntigravityCommand')(function* () {
  // No install at launch: the active runtime (command + arguments) was pinned at Download time, so launch is offline.
  const active = yield* resolveActiveRuntime('antigravity-acp');
  if (active.distribution._tag !== 'binary') {
    return yield* new MissingLaunchPrerequisite({
      executable: ANTIGRAVITY_ACP_SPAWN_NAME,
      message: 'Active Antigravity runtime has no recorded command. Download it in Settings > Providers',
    });
  }
  const path = yield* Path;
  const browserHelperPath = yield* mapAntigravityFs(
    ensureAntigravityProviderBrowserHelper(),
    'Antigravity BROWSER helper ensure failed',
  );
  const antigravityAcpHome = yield* mapAntigravityFs(
    ensureAntigravityProviderHome(),
    'Antigravity home directory ensure failed',
  );
  const os = yield* OS;
  const env = buildAntigravitySpawnEnv({
    antigravityAcpHome,
    baseEnv: os.env(),
    browserHelperPath,
    harnessPath: path.join(active.runtimeDir, ANTIGRAVITY_HARNESS_MEMBER),
    platform: os.platform(),
  });
  // Hosts resolve this name to the active runtime's recorded command from `current.json`; never an arbitrary path.
  return ChildProcess.make(ANTIGRAVITY_ACP_SPAWN_NAME, [...active.distribution.args], {
    ...antigravitySpawnOptions,
    env,
    extendEnv: false,
  });
});

/** Resolve PATH/auth prerequisites and return the ACP spawn command for a launch target. */
export const makeAcpLaunchCommand = Effect.fn('makeAcpLaunchCommand')(
  function* (launchTarget: AgentLaunchTarget) {
    yield* Effect.logInfo('Building ACP launch command').pipe(annotateLaunchTargetLogs(launchTarget));

    if (launchTarget === 'cursor-acp') {
      return yield* makeCursorNativeCommand();
    }

    if (launchTarget === 'antigravity-acp') {
      return yield* makeAntigravityCommand();
    }

    yield* requireExecutableOnPath('node');
    const entry = yield* resolveAdapterEntry(launchTarget);

    switch (launchTarget) {
      case 'claude-agent-acp':
        return yield* makeVendorCliAdapterCommand(
          {
            envKey: 'CLAUDE_CODE_EXECUTABLE',
            executable: 'claude',
            extraEnv: { MCP_TOOL_TIMEOUT: String(CLAUDE_MCP_TOOL_TIMEOUT_MS) },
            launchTarget,
          },
          entry,
        );
      case 'codex-acp':
        return yield* makeVendorCliAdapterCommand({ envKey: 'CODEX_PATH', executable: 'codex', launchTarget }, entry);
    }
  },
  Effect.annotateLogs({ module: 'acpLaunchCommand' }),
  Effect.tapError(error => Effect.logError('makeAcpLaunchCommand failed', error)),
);
