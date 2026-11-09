/**
 * What the hub process does around {@link startHub}: bind (the single-instance lock: a second hub fails with
 * EADDRINUSE), publish the owner-only discovery file, then exit once idle. The file is removed on the way out only if it
 * is still this process's, so a successor hub's file survives.
 */
import { Effect, Option, Schema } from 'effect';
import type { Duration } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import { randomBytes } from 'node:crypto';

import { startHub } from './hub.ts';
import { Discovery, DISCOVERY_FILENAME, PROTOCOL_VERSION } from './protocol.ts';

export type HubProcessOptions = {
  /** HOA home directory (`~/.hoa`) the discovery file goes in. */
  readonly home: string;
  readonly idleGrace: Duration.Input;
  readonly port: number;
};

export const runHubProcess = Effect.fn('runHubProcess')(function* (options: HubProcessOptions) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  const secret = randomBytes(32).toString('base64url');
  const hub = yield* startHub({ idleGrace: options.idleGrace, port: options.port, secret });

  const discoveryPath = path.join(options.home, DISCOVERY_FILENAME);
  const discovery: Discovery = { pid: process.pid, port: hub.port, protocolVersion: PROTOCOL_VERSION, secret };
  yield* fs.makeDirectory(options.home, { recursive: true });
  // Write-then-rename so a client never reads a half-written file; mode 0600: the secret is a credential.
  const staging = `${discoveryPath}.${process.pid}.tmp`;
  yield* fs.writeFileString(staging, JSON.stringify(discovery), { mode: 0o600 });
  yield* fs.chmod(staging, 0o600);
  yield* fs.rename(staging, discoveryPath);
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      const current = yield* fs
        .readFileString(discoveryPath)
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Discovery))), Effect.option);
      if (Option.isSome(current) && current.value.pid === process.pid) {
        yield* fs.remove(discoveryPath, { force: true });
      }
    }).pipe(Effect.ignore),
  );
  yield* Effect.logInfo('Hub listening', { port: hub.port });
  return hub;
});
