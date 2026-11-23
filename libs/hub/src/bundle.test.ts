/**
 * The shipped bundles, as a Host runs them: `node hub-launcher.mjs hub.mjs …` against a temp HOA home. Covers what the
 * in-process tests cannot: the launcher's detached spawn, the hub's log file, and the real process exiting once idle.
 * Needs `dist/` (turbo runs `build` before `test`). `it.live`: real processes and timers.
 */
import { assert, describe, it } from '@effect/vitest';
import { Effect, Schedule, Schema } from 'effect';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Discovery, DISCOVERY_FILENAME, HealthPayload } from './protocol.ts';

const built = join(import.meta.dirname, '..', 'dist');

/** Exactly the files the desktop app lists as resources (`tauri.conf.json`): a bundle needing any other file fails here. */
const SHIPPED = ['hub-launcher.mjs', 'hub.mjs'];

const dist = mkdtempSync(join(tmpdir(), 'hoa-hub-shipped-'));
for (const file of SHIPPED) {
  copyFileSync(join(built, file), join(dist, file));
}

/** Run the launcher (it returns at once) for a hub on an ephemeral port that exits 300 ms after going idle. */
const launch = (home: string, extraArgs: readonly string[] = [], env: Record<string, string> = {}) =>
  Effect.sync(() =>
    execFileSync(
      process.execPath,
      [join(dist, 'hub-launcher.mjs'), join(dist, 'hub.mjs'), '--port', '0', '--idle-grace-ms', '300', ...extraArgs],
      { env: { ...process.env, HOA_HOME: home, ...env }, timeout: 5000 },
    ),
  );

/** Retry `check` until it succeeds (a few seconds at most). */
const eventually = <A>(check: () => A) =>
  Effect.try(check).pipe(Effect.retry({ schedule: Schedule.spaced('50 millis'), times: 100 }));

const readDiscovery = (home: string) =>
  eventually(() =>
    Schema.decodeUnknownSync(Schema.fromJsonString(Discovery))(readFileSync(join(home, DISCOVERY_FILENAME), 'utf8')),
  );

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('hub bundles', () => {
  it.live('the launcher starts a detached hub that logs to the HOA home and exits once idle', () =>
    Effect.gen(function* () {
      const home = mkdtempSync(join(tmpdir(), 'hoa-hub-bundle-'));
      yield* launch(home);
      const discovery = yield* readDiscovery(home);
      if (process.platform !== 'win32') {
        assert.strictEqual((statSync(join(home, DISCOVERY_FILENAME)).mode % 0o1000).toString(8), '600');
      }

      const health = yield* Effect.promise(() =>
        fetch(`http://127.0.0.1:${discovery.port}/health`).then(response => response.json()),
      );
      assert.strictEqual(Schema.decodeUnknownSync(HealthPayload)(health).pid, discovery.pid);
      assert.isTrue(existsSync(join(home, 'logs', 'hub.log')));

      // No client ever connects: the hub exits after its grace and takes its discovery file with it.
      yield* eventually(() => {
        assert.isFalse(existsSync(join(home, DISCOVERY_FILENAME)));
      });
      yield* eventually(() => {
        assert.isFalse(isAlive(discovery.pid));
      });
    }),
  );

  it.live('a hub log over 1 MiB is rotated aside on the next launch', () =>
    Effect.gen(function* () {
      const home = mkdtempSync(join(tmpdir(), 'hoa-hub-bundle-'));
      mkdirSync(join(home, 'logs'));
      const previous = 'x'.repeat(1024 * 1024 + 1);
      writeFileSync(join(home, 'logs', 'hub.log'), previous);
      yield* launch(home);
      const discovery = yield* readDiscovery(home);
      assert.strictEqual(readFileSync(join(home, 'logs', 'hub.log.1'), 'utf8'), previous);
      assert.isBelow(statSync(join(home, 'logs', 'hub.log')).size, previous.length);
      yield* eventually(() => {
        assert.isFalse(isAlive(discovery.pid));
      });
    }),
  );

  it.live('a prod-target hub exports nothing, even with an OTLP endpoint in its environment', () =>
    Effect.gen(function* () {
      const requests: string[] = [];
      const collector = createServer((request, response) => {
        requests.push(request.url ?? '');
        response.end();
      });
      yield* Effect.promise(
        () =>
          new Promise<void>(done => {
            collector.listen(0, '127.0.0.1', done);
          }),
      );
      const address = collector.address();
      const collectorPort = typeof address === 'object' && address !== null ? address.port : 0;
      const home = mkdtempSync(join(tmpdir(), 'hoa-hub-bundle-'));
      yield* launch(home, ['--build-target', 'prod'], {
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collectorPort}`,
      });
      const discovery = yield* readDiscovery(home);
      yield* Effect.promise(() => fetch(`http://127.0.0.1:${discovery.port}/health`));
      yield* eventually(() => {
        assert.isFalse(isAlive(discovery.pid));
      });
      yield* Effect.sleep('300 millis');
      collector.close();
      assert.deepStrictEqual(requests, []);
    }),
  );
});
