import { OS } from '@lib/context-services';
import { invoke } from '@tauri-apps/api/core';
import { homeDir } from '@tauri-apps/api/path';
import { arch, platform } from '@tauri-apps/plugin-os';
import { Effect, Layer, Redacted, Schema } from 'effect';

import { mapTauriArchToNode, mapTauriPlatformToNode } from './mapTauriPlatform.ts';

class HostProcessInfoError extends Schema.TaggedError<HostProcessInfoError>()('HostProcessInfoError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

class HomeDirError extends Schema.TaggedError<HomeDirError>()('HomeDirError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

const HostProcessInfoSchema = Schema.Struct({
  cwd: Schema.String,
  env: Schema.Record(Schema.String, Schema.String),
});

/**
 * Tauri Live for {@link OS}: loads allowlisted env + cwd from `host_process_info`,
 * resolves `homeDir` once, and exposes Node-compatible `platform()` strings.
 */
export const OSLive = Layer.effect(
  OS,
  Effect.gen(function* () {
    yield* Effect.logDebug('Loading host process info');
    const raw = yield* Effect.tryPromise({
      catch: cause =>
        new HostProcessInfoError({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      try: () => invoke<unknown>('host_process_info'),
    }).pipe(
      Effect.tapError(error => Effect.logFatal('host_process_info invoke failed', error.message)),
      Effect.orDie,
    );
    const host = yield* Schema.decodeUnknownEffect(HostProcessInfoSchema)(raw).pipe(
      Effect.mapError(
        issue =>
          new HostProcessInfoError({
            cause: issue,
            message: `Invalid host_process_info: ${String(issue)}`,
          }),
      ),
      Effect.tapError(error => Effect.logFatal('host_process_info decode failed', error.message)),
      Effect.orDie,
    );

    const home = yield* Effect.tryPromise({
      catch: cause =>
        new HomeDirError({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      try: () => homeDir(),
    }).pipe(
      Effect.tapError(error => Effect.logFatal('homeDir resolve failed', error.message)),
      Effect.orDie,
    );

    const nodePlatform = mapTauriPlatformToNode(platform());
    const nodeArch = mapTauriArchToNode(arch());
    yield* Effect.logInfo('OS Live ready', { arch: nodeArch, cwd: Redacted.make(host.cwd), platform: nodePlatform });

    return {
      arch: () => nodeArch,
      cwd: () => host.cwd,
      env: () => host.env,
      homedir: () => home,
      platform: () => nodePlatform,
    };
  }),
);
