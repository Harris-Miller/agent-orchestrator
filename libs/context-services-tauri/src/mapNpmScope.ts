/**
 * Logical `npm` operations → the unique Tauri shell scope names in `capabilities/default.json`.
 * Tauri selects scopes by name, and each scope pins a positional argument array (never `args: true`), so the host
 * maps the operation first and rejects anything that is not one of the three provider operations.
 */
const PROVIDER_PACKAGES = {
  '@agentclientprotocol/claude-agent-acp': 'claude-agent-acp',
  '@agentclientprotocol/codex-acp': 'codex-acp',
} as const;

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export type NpmScopeName = 'provider-npm-install' | 'provider-npm-version' | 'provider-npm-view';

const providerOfPackage = (spec: string, versionPattern: RegExp | 'latest'): string | undefined => {
  const at = spec.lastIndexOf('@');
  if (at <= 0) {
    return undefined;
  }
  const name = spec.slice(0, at);
  const version = spec.slice(at + 1);
  if (!Object.hasOwn(PROVIDER_PACKAGES, name)) {
    return undefined;
  }
  const valid = versionPattern === 'latest' ? version === 'latest' : versionPattern.test(version);
  return valid ? PROVIDER_PACKAGES[name as keyof typeof PROVIDER_PACKAGES] : undefined;
};

/** `undefined` = refuse to spawn. For install, package, provider directory and version must agree. */
export const npmScopeNameFor = (args: readonly string[]): NpmScopeName | undefined => {
  if (args.length === 1 && args[0] === '--version') {
    return 'provider-npm-version';
  }
  if (args.length === 3 && args[0] === 'view' && args[2] === 'version') {
    return providerOfPackage(args[1] ?? '', 'latest') === undefined ? undefined : 'provider-npm-view';
  }
  if (
    args.length === 6 &&
    args[0] === 'install' &&
    args[1] === '--prefix' &&
    args[3] === '--omit=optional' &&
    args[4] === '--ignore-scripts'
  ) {
    const prefix = args[2] ?? '';
    const spec = args[5] ?? '';
    const provider = providerOfPackage(spec, VERSION);
    if (provider === undefined) {
      return undefined;
    }
    const version = spec.slice(spec.lastIndexOf('@') + 1);
    const segments = prefix.split(/[\\/]/);
    const runtimeIndex = segments.length - 2;
    const matches =
      segments.length >= 5 &&
      segments[segments.length - 1] === version &&
      segments[runtimeIndex] === 'runtime' &&
      segments[segments.length - 3] === provider &&
      segments[segments.length - 4] === 'providers' &&
      segments[segments.length - 5] === '.ao';
    return matches ? 'provider-npm-install' : undefined;
  }
  return undefined;
};
