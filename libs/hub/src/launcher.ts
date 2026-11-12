/**
 * Hub launcher (bundled as `hub-launcher.mjs`): `node hub-launcher.mjs <hub.mjs> [hub args…]`.
 *
 * Both hosts kill the children they track (Tauri on exit / reload, VS Code when a webview goes away), and the hub must
 * outlive whichever client started it. So a client spawns this launcher instead, which starts the hub detached in its
 * own session and exits at once. The hub is then nobody's tracked child. If a hub is already running, the new one fails
 * to bind and exits; that race is harmless.
 *
 * The hub's stdout / stderr go to `<HOA home>/logs/hub.log` (appended; moved to `hub.log.1` once over 1 MiB), so a hub
 * that fails to start leaves a trace.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { hubHome } from './home.ts';

const MAX_LOG_BYTES = 1024 * 1024;

const [hubPath, ...hubArgs] = process.argv.slice(2);
if (hubPath === undefined) {
  process.stderr.write('usage: hub-launcher <hub.mjs> [hub args…]\n');
  process.exit(2);
}

const logDir = join(hubHome(), 'logs');
const logPath = join(logDir, 'hub.log');
mkdirSync(logDir, { recursive: true });
try {
  if (statSync(logPath).size > MAX_LOG_BYTES) {
    renameSync(logPath, `${logPath}.1`);
  }
} catch {
  // No log yet.
}
const log = openSync(logPath, 'a', 0o600);

spawn(process.execPath, [hubPath, ...hubArgs], {
  detached: true,
  stdio: ['ignore', log, log],
  windowsHide: true,
}).unref();
process.exit(0);
