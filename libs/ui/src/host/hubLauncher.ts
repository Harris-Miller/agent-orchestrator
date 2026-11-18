/**
 * Starting the hub from a Harness. The client spawns the bundled launcher through the normal `ChildProcessSpawner`;
 * the launcher starts the hub detached and exits at once, so the hub is no Host's tracked child and outlives whichever
 * window started it (root ADR 0003: the exception to VS Code ADR 0003, "webview lifetime equals process lifetime").
 */
import { BundledResource, OS } from '@lib/context-services';
import { defaultSettings, readUserSettings } from '@lib/hoa-home';
import { DEFAULT_HUB_PORT } from '@lib/hub/protocol';
import type { ClientKind } from '@lib/hub/protocol';
import { Effect, Option, Redacted, Schema } from 'effect';

import { requireExecutableOnPath } from './findExecutableOnPath.ts';
import { HubUnavailable } from './hubClient.ts';
import type { HubClientOptions } from './hubClient.ts';
import type { HubToolContext } from './hubToolHandler.ts';
import { runCapturedProcess } from './runCapturedProcess.ts';

/** Same relative path in both Hosts: Tauri resources (`tauri.conf.json`) and the extension root (VS Code build). */
export const HUB_RESOURCE = 'hub/hub.mjs';
export const HUB_LAUNCHER_RESOURCE = 'hub/hub-launcher.mjs';

/** `OS.env` markers the VS Code extension host adds; the desktop Host sets neither. */
const VSCODE_HOST_ENV = 'HOA_HOST';
const VSCODE_REMOTE_ENV = 'HOA_VSCODE_REMOTE_NAME';

/**
 * The `hubPort` User setting. Read leniently from `settings.json`'s open record rather than declared in the strict
 * schema: a bad value there would make every other setting fall back to its default.
 */
const decodeHubPort = Schema.decodeUnknownOption(Schema.Int.check(Schema.isBetween({ maximum: 65_535, minimum: 1 })));

const cannotStart = () =>
  new HubUnavailable({ reason: 'Could not start the HOA hub. Its log is at ~/.hoa/logs/hub.log.' });

export const launchHub = Effect.fnUntraced(function* (port: number) {
  yield* requireExecutableOnPath('node').pipe(
    Effect.mapError(
      () => new HubUnavailable({ reason: 'Node.js was not found on PATH. Install Node.js 22 or later, then restart.' }),
    ),
  );
  const resources = yield* BundledResource;
  const missing = () =>
    new HubUnavailable({ reason: 'This build does not include the HOA hub. Reinstall or rebuild the app.' });
  const launcher = yield* resources.resolve(HUB_LAUNCHER_RESOURCE).pipe(Effect.mapError(missing));
  const hub = yield* resources.resolve(HUB_RESOURCE).pipe(Effect.mapError(missing));
  const result = yield* runCapturedProcess('node', [launcher, hub, '--port', String(port)]).pipe(
    Effect.mapError(cannotStart),
  );
  if (result.exitCode !== 0) {
    yield* Effect.logWarning('Hub launcher failed', result.exitCode, Redacted.make(result.stderr));
    return yield* cannotStart();
  }
});

/**
 * This Host's hub client options, or the reason it must run degraded. A remote VS Code window (SSH, WSL, containers,
 * Codespaces) runs its agents on the remote machine, which cannot reach a hub on this one.
 */
export const hostHubClientOptions = Effect.fnUntraced(function* (registry: HubToolContext['registry']) {
  const env = (yield* OS).env();
  const remote = env[VSCODE_REMOTE_ENV];
  if (remote !== undefined && remote !== '') {
    return yield* new HubUnavailable({
      reason: `This is a remote window (${remote}); HOA hub features only work in local windows. Open the folder in a local window to use them.`,
    });
  }
  const clientKind: ClientKind = env[VSCODE_HOST_ENV] === 'vscode' ? 'vscode' : 'desktop';
  const settings = yield* readUserSettings().pipe(Effect.orElseSucceed(() => defaultSettings));
  const port = Option.getOrElse(decodeHubPort(settings.hubPort), () => DEFAULT_HUB_PORT);
  return {
    clientKind,
    port,
    registry,
    startHub: launchHub(port),
  } satisfies HubClientOptions<unknown>;
});
