/**
 * Hub launcher (bundled as `hub-launcher.mjs`): `node hub-launcher.mjs <hub.mjs>`.
 *
 * Both hosts kill the children they track (Tauri on exit / reload, VS Code when a webview goes away), and the hub must
 * outlive whichever client started it. So a client spawns this launcher instead, which starts the hub detached in its
 * own session with no stdio and exits at once. The hub is then nobody's tracked child. If a hub is already running, the
 * new one fails to bind and exits; that race is harmless.
 */
import { spawn } from 'node:child_process';

const [hubPath] = process.argv.slice(2);
if (hubPath === undefined) {
  process.stderr.write('usage: hub-launcher <hub.mjs>\n');
  process.exit(2);
}
spawn(process.execPath, [hubPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
process.exit(0);
