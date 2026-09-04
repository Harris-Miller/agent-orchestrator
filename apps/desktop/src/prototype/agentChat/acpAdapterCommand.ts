/**
 * Provider launch for Codex/Claude ACP adapters from the Tauri adapter resource tree.
 */
import { resolveResource } from '@tauri-apps/api/path';
import { Effect } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

import { MissingLaunchPrerequisite, requireExecutableOnPath } from './findExecutableOnPath.ts';

export { MissingLaunchPrerequisite };

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

const adapterEntryResource = {
  'claude-agent-acp': 'acp-adapter-resources/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
  'codex-acp': 'acp-adapter-resources/node_modules/@agentclientprotocol/codex-acp/dist/index.js',
} as const;

export type AcpAdapterBackend = keyof typeof adapterEntryResource;

const resolveAdapterEntry = Effect.fn('resolveAdapterEntry')(function* (backend: AcpAdapterBackend) {
  const resourcePath = adapterEntryResource[backend];
  return yield* Effect.tryPromise({
    catch: cause =>
      new MissingLaunchPrerequisite({
        executable: resourcePath,
        message: `ACP adapter resource not found (${resourcePath}): ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      }),
    try: () => resolveResource(resourcePath),
  });
});

/** Detect Node + vendor CLI, resolve adapter entry, return spawn command. */
export const makeAcpAdapterCommand = Effect.fn('makeAcpAdapterCommand')(function* (backend: AcpAdapterBackend) {
  yield* requireExecutableOnPath('node');
  const entry = yield* resolveAdapterEntry(backend);

  if (backend === 'codex-acp') {
    const codexPath = yield* requireExecutableOnPath('codex');
    return ChildProcess.make('node', [entry], {
      ...pipedSpawnOptions,
      env: { CODEX_PATH: codexPath },
    });
  }

  const claudePath = yield* requireExecutableOnPath('claude');
  return ChildProcess.make('node', [entry], {
    ...pipedSpawnOptions,
    env: { CLAUDE_CODE_EXECUTABLE: claudePath },
  });
});
