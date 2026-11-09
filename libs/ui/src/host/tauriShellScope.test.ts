/**
 * The desktop Tauri shell scope (`capabilities/default.json`) and the Rust host (`lib.rs`) repeat strings that live in
 * TypeScript. A mismatch compiles but fails at runtime (Tauri refuses the spawn), so pin them to the TS constants here.
 */
import { readFileSync } from 'node:fs';

import { assert, describe, it } from '@effect/vitest';
import { HOA_HOME_DIRNAME, PROVIDER_RUNTIME_DIRNAME, PROVIDERS_DIRNAME } from '@lib/hoa-home';

import capabilities from '../../../../apps/desktop/src-tauri/capabilities/default.json' with { type: 'json' };
import { keepAwakeHoldCommand } from './keepAwake.ts';

type ScopeArg = string | { readonly validator: string };
type ScopeEntry = { readonly args?: boolean | readonly ScopeArg[]; readonly cmd?: string; readonly name: string };

const spawnScope = (): readonly ScopeEntry[] => {
  const permissions: readonly unknown[] = capabilities.permissions;
  const permission = permissions.find(
    (entry): entry is { allow: readonly ScopeEntry[]; identifier: string } =>
      typeof entry === 'object' && entry !== null && 'identifier' in entry && entry.identifier === 'shell:allow-spawn',
  );
  assert.isDefined(permission, 'shell:allow-spawn permission');
  return permission.allow;
};

describe('Tauri shell scope', () => {
  it.each(['darwin', 'linux'])('allows the exact %s Keep-awake hold command', platform => {
    const hold = keepAwakeHoldCommand(platform);
    assert.isDefined(hold);
    const entry = spawnScope().find(candidate => candidate.name === hold.command);
    assert.isDefined(entry, `no spawn scope entry named ${hold.command}`);
    assert.strictEqual(entry.cmd, hold.command);
    assert.deepStrictEqual(entry.args, hold.args);
  });

  it('validates provider runtime install prefixes under the HOA home', () => {
    const install = spawnScope().find(candidate => candidate.name === 'provider-npm-install');
    assert.isDefined(install);
    assert.isTrue(Array.isArray(install.args));
    const prefixValidator = (install.args as readonly ScopeArg[]).find(
      (arg): arg is { validator: string } => typeof arg === 'object',
    );
    assert.isDefined(prefixValidator);
    const prefix = new RegExp(prefixValidator.validator);
    const runtimeDir = (home: string, id: string) =>
      [home, HOA_HOME_DIRNAME, PROVIDERS_DIRNAME, id, PROVIDER_RUNTIME_DIRNAME, '1.2.3'].join('/');
    assert.isTrue(prefix.test(runtimeDir('/Users/me', 'claude-agent-acp')));
    assert.isTrue(prefix.test(runtimeDir('/home/me', 'codex-acp')));
    assert.isFalse(prefix.test(runtimeDir('/Users/me', 'other-acp')));
    assert.isFalse(prefix.test('/Users/me/.ao/providers/codex-acp/runtime/1.2.3'));
  });
});

describe('Rust host', () => {
  it('names the HOA home directory like TypeScript', () => {
    const libRs = readFileSync(new URL('../../../../apps/desktop/src-tauri/src/lib.rs', import.meta.url), 'utf8');
    assert.include(libRs, `const HOA_HOME_DIRNAME: &str = "${HOA_HOME_DIRNAME}";`);
  });
});
