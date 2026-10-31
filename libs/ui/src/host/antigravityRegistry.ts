/**
 * ACP registry metadata for Antigravity: resolved once into an exact, pinned binary distribution.
 * https://raw.githubusercontent.com/agentclientprotocol/registry/main/antigravity-acp/agent.json
 */
import type { ProviderDistribution } from '@lib/ao-home';
import { Effect, Option, Record, Schema } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';

export const ANTIGRAVITY_REGISTRY_URL =
  'https://raw.githubusercontent.com/agentclientprotocol/registry/main/antigravity-acp/agent.json';

/** Archives must come from Google's extension host. */
export const ANTIGRAVITY_ARCHIVE_ORIGIN = 'https://dl.google.com/agy-extensions/';

const BinaryTargetSchema = Schema.Struct({
  archive: Schema.String,
  args: Schema.optionalKey(Schema.Array(Schema.String)),
  cmd: Schema.String,
  sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
});

export const AntigravityRegistrySchema = Schema.Struct({
  distribution: Schema.Struct({ binary: Schema.Record(Schema.String, BinaryTargetSchema) }),
  id: Schema.Literal('antigravity-acp'),
  version: Schema.String,
});
export type AntigravityRegistry = typeof AntigravityRegistrySchema.Type;

export class AntigravityRegistryError extends Schema.TaggedError<AntigravityRegistryError>()(
  'AntigravityRegistryError',
  { message: Schema.String },
) {}

/** Host `arm64` → registry `aarch64`, `x64` → `x86_64`. Windows stays excluded in this cut. */
export const antigravityRegistryPlatformKey = (platform: string, arch: string): string | undefined => {
  if (platform !== 'darwin' && platform !== 'linux') {
    return undefined;
  }
  switch (arch) {
    case 'arm64':
      return `${platform}-aarch64`;
    case 'x64':
      return `${platform}-x86_64`;
    default:
      return undefined;
  }
};

/** Registry `./agy_acp_server.par` → bare file name; anything that could leave the runtime dir is rejected. */
const normalizeCmd = (cmd: string): string | undefined => {
  const name = cmd.startsWith('./') ? cmd.slice(2) : cmd;
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ? name : undefined;
};

/** Pure: pick the exact platform asset out of a decoded registry document. */
export const resolveAntigravityDistribution = (
  registry: AntigravityRegistry,
  platform: string,
  arch: string,
): Effect.Effect<Extract<ProviderDistribution, { readonly _tag: 'binary' }>, AntigravityRegistryError> => {
  const key = antigravityRegistryPlatformKey(platform, arch);
  if (key === undefined) {
    return Effect.fail(
      new AntigravityRegistryError({
        message:
          platform === 'win32'
            ? 'Antigravity ACP is not supported on Windows yet'
            : `Antigravity ACP has no build for ${platform}-${arch}`,
      }),
    );
  }
  const found = Record.get(registry.distribution.binary, key);
  if (Option.isNone(found)) {
    return Effect.fail(new AntigravityRegistryError({ message: `Antigravity registry has no ${key} build` }));
  }
  const target = found.value;
  if (!target.archive.startsWith(ANTIGRAVITY_ARCHIVE_ORIGIN) || target.archive.includes('..')) {
    return Effect.fail(
      new AntigravityRegistryError({ message: `Antigravity archive is outside ${ANTIGRAVITY_ARCHIVE_ORIGIN}` }),
    );
  }
  const cmd = normalizeCmd(target.cmd);
  if (cmd === undefined) {
    return Effect.fail(
      new AntigravityRegistryError({ message: `Antigravity registry command is unsafe: ${target.cmd}` }),
    );
  }
  return Effect.succeed({
    _tag: 'binary',
    archive: target.archive,
    args: [...(target.args ?? [])],
    cmd,
    platform: key,
    sha256: target.sha256,
    version: registry.version,
  });
};

/** Fetch the registry once and resolve it for this host. */
export const fetchAntigravityDistribution = Effect.fn('fetchAntigravityDistribution')(function* (
  platform: string,
  arch: string,
) {
  const http = yield* HttpClient.HttpClient;
  const body = yield* http.get(ANTIGRAVITY_REGISTRY_URL).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(response => response.json),
    Effect.mapError(
      error => new AntigravityRegistryError({ message: `Antigravity registry fetch failed: ${error.message}` }),
    ),
  );
  const registry = yield* Schema.decodeUnknownEffect(AntigravityRegistrySchema)(body).pipe(
    Effect.mapError(
      error => new AntigravityRegistryError({ message: `Antigravity registry is invalid: ${error.message}` }),
    ),
  );
  return yield* resolveAntigravityDistribution(registry, platform, arch);
});
