/**
 * Starting the hub from a Harness. The client spawns the bundled launcher through the normal `ChildProcessSpawner`;
 * the launcher starts the hub detached and exits at once, so the hub is no Host's tracked child and outlives whichever
 * window started it (ADR 0002: the exception to VS Code ADR 0003, "webview lifetime equals process lifetime").
 */
import { BundledResource, OS } from '@lib/context-services';
import { DEFAULT_HUB_PORT } from '@lib/hub/protocol';
import type { ClientKind } from '@lib/hub/protocol';
import { Effect } from 'effect';

import { requireExecutableOnPath } from './findExecutableOnPath.ts';
import { HubUnavailable } from './hubClient.ts';
import type { HubClientOptions } from './hubClient.ts';
import { runCapturedProcess } from './runCapturedProcess.ts';

/** Same relative path in both Hosts: Tauri resources (`tauri.conf.json`) and the extension root (VS Code build). */
export const HUB_RESOURCE = 'hub/hub.mjs';
export const HUB_LAUNCHER_RESOURCE = 'hub/hub-launcher.mjs';

/** `OS.env` markers the VS Code extension host adds; the desktop Host sets neither. */
const VSCODE_HOST_ENV = 'HOA_HOST';
const VSCODE_REMOTE_ENV = 'HOA_VSCODE_REMOTE_NAME';

export const launchHub = Effect.gen(function* () {
  yield* requireExecutableOnPath('node').pipe(
    Effect.mapError(() => new HubUnavailable({ reason: 'Node.js was not found on PATH, and the HOA hub needs it.' })),
  );
  const resources = yield* BundledResource;
  const missing = () => new HubUnavailable({ reason: 'This build does not include the HOA hub.' });
  const launcher = yield* resources.resolve(HUB_LAUNCHER_RESOURCE).pipe(Effect.mapError(missing));
  const hub = yield* resources.resolve(HUB_RESOURCE).pipe(Effect.mapError(missing));
  const result = yield* runCapturedProcess('node', [launcher, hub]).pipe(
    Effect.mapError(() => new HubUnavailable({ reason: 'Could not start the HOA hub.' })),
  );
  if (result.exitCode !== 0) {
    yield* Effect.logWarning('Hub launcher failed', result.exitCode, result.stderr);
    return yield* new HubUnavailable({ reason: 'Could not start the HOA hub.' });
  }
});

/**
 * This Host's hub client options, or the reason it must run degraded. A remote VS Code window (SSH, WSL, containers,
 * Codespaces) runs its agents on the remote machine, which cannot reach a hub on this one.
 */
export const hostHubClientOptions = Effect.gen(function* () {
  const env = (yield* OS).env();
  const remote = env[VSCODE_REMOTE_ENV];
  if (remote !== undefined && remote !== '') {
    return yield* new HubUnavailable({
      reason: `This is a remote window (${remote}); HOA hub features only work in local windows.`,
    });
  }
  const clientKind: ClientKind = env[VSCODE_HOST_ENV] === 'vscode' ? 'vscode' : 'desktop';
  return {
    clientKind,
    port: DEFAULT_HUB_PORT,
    startHub: launchHub,
  } satisfies HubClientOptions<unknown>;
});
