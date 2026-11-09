/**
 * Logical `npm` operations → the unique Tauri shell scope names in `capabilities/default.json`.
 * Tauri selects scopes by name, and each scope pins a positional argument array (never `args: true`), so the host
 * maps the operation first and rejects anything that is not one of the three provider operations.
 */
import {
  HOA_HOME_DIRNAME,
  PROVIDER_NPM_PACKAGES,
  PROVIDER_RUNTIME_DIRNAME,
  PROVIDERS_DIRNAME,
  ReleaseVersionSchema,
} from '@lib/hoa-home';
import type { NpmProviderId } from '@lib/hoa-home';
import { Option, Schema } from 'effect';

const NPM_PROVIDER_IDS = Object.keys(PROVIDER_NPM_PACKAGES) as readonly NpmProviderId[];

const ProviderPackage = Schema.Literals(Object.values(PROVIDER_NPM_PACKAGES));

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
    Schema.TemplateLiteralParser([ProviderPackage, '@', ReleaseVersionSchema]),
  ]),
]);

const decodeNpmArgs = Schema.decodeUnknownOption(NpmArgs);

export type NpmScopeName = 'provider-npm-install' | 'provider-npm-version' | 'provider-npm-view';

/** The install prefix must be `…/.hoa/providers/<provider>/runtime/<version>` for the package being installed. */
const isRuntimePrefixFor = (prefix: string, provider: NpmProviderId, version: string): boolean =>
  prefix.split(/[\\/]/).slice(-5).join('/') ===
  [HOA_HOME_DIRNAME, PROVIDERS_DIRNAME, provider, PROVIDER_RUNTIME_DIRNAME, version].join('/');

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
      const provider = NPM_PROVIDER_IDS.find(id => PROVIDER_NPM_PACKAGES[id] === pkg);
      return provider !== undefined && isRuntimePrefixFor(prefix, provider, version)
        ? 'provider-npm-install'
        : undefined;
    }
  }
};
