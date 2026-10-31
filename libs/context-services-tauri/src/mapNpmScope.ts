/**
 * Logical `npm` operations → the unique Tauri shell scope names in `capabilities/default.json`.
 * Tauri selects scopes by name, and each scope pins a positional argument array (never `args: true`), so the host
 * maps the operation first and rejects anything that is not one of the three provider operations.
 */
import { Option, Schema } from 'effect';

const PROVIDER_PACKAGES = {
  '@agentclientprotocol/claude-agent-acp': 'claude-agent-acp',
  '@agentclientprotocol/codex-acp': 'codex-acp',
} as const;

const ProviderPackage = Schema.Literals(['@agentclientprotocol/claude-agent-acp', '@agentclientprotocol/codex-acp']);
const Version = Schema.String.check(Schema.isPattern(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/));

const NpmArgs = Schema.Union([
  Schema.Tuple([Schema.Literal('--version')]),
  Schema.Tuple([
    Schema.Literal('view'),
    Schema.TemplateLiteralParser([ProviderPackage, '@latest']),
    Schema.Literal('version'),
  ]),
  Schema.Tuple([
    Schema.Literal('install'),
    Schema.Literal('--prefix'),
    Schema.String,
    Schema.Literal('--omit=optional'),
    Schema.Literal('--ignore-scripts'),
    Schema.TemplateLiteralParser([ProviderPackage, '@', Version]),
  ]),
]);

const decodeNpmArgs = Schema.decodeUnknownOption(NpmArgs);

export type NpmScopeName = 'provider-npm-install' | 'provider-npm-version' | 'provider-npm-view';

/** The install prefix must be `…/.ao/providers/<provider>/runtime/<version>` for the package being installed. */
const isRuntimePrefixFor = (prefix: string, provider: string, version: string): boolean => {
  const segments = prefix.split(/[\\/]/);
  return segments.slice(-5).join('/') === `.ao/providers/${provider}/runtime/${version}`;
};

/** `undefined` = refuse to spawn. For install, package, provider directory and version must agree. */
export const npmScopeNameFor = (args: readonly string[]): NpmScopeName | undefined => {
  const decoded = decodeNpmArgs(args);
  if (Option.isNone(decoded)) {
    return undefined;
  }
  const parsed = decoded.value;
  switch (parsed[0]) {
    case '--version':
      return 'provider-npm-version';
    case 'view':
      return 'provider-npm-view';
    case 'install': {
      const [, , prefix, , , [pkg, , version]] = parsed;
      return isRuntimePrefixFor(prefix, PROVIDER_PACKAGES[pkg], version) ? 'provider-npm-install' : undefined;
    }
  }
};
