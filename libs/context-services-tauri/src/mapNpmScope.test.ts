import { assert, describe, it } from 'vitest';

import { npmScopeNameFor } from './mapNpmScope.ts';

const PREFIX = '/Users/harris with space/.hoa/providers/claude-agent-acp/runtime/1.2.3';
const install = (overrides: Partial<Record<'prefix' | 'spec', string>> = {}) => [
  'install',
  '--prefix',
  overrides.prefix ?? PREFIX,
  '--omit=optional',
  '--ignore-scripts',
  overrides.spec ?? '@agentclientprotocol/claude-agent-acp@1.2.3',
];

describe('npmScopeNameFor', () => {
  it('maps exactly the three provider operations to their scope names', () => {
    assert.strictEqual(npmScopeNameFor(['--version']), 'provider-npm-version');
    assert.strictEqual(
      npmScopeNameFor(['view', '@agentclientprotocol/codex-acp@latest', 'version']),
      'provider-npm-view',
    );
    assert.strictEqual(npmScopeNameFor(install()), 'provider-npm-install');
  });

  it('refuses other packages, versions, flags, extra arguments, and a prefix that disagrees with the package', () => {
    assert.isUndefined(npmScopeNameFor(['install', '-g', 'left-pad']));
    assert.isUndefined(npmScopeNameFor(['view', 'left-pad@latest', 'version']));
    assert.isUndefined(npmScopeNameFor(['--version', '--foo']));
    assert.isUndefined(npmScopeNameFor(['exec', 'x']));
    assert.isUndefined(npmScopeNameFor(install({ spec: 'left-pad@1.2.3' })));
    assert.isUndefined(npmScopeNameFor(install({ spec: '@agentclientprotocol/claude-agent-acp@latest' })));
    assert.isUndefined(npmScopeNameFor(install({ spec: '@agentclientprotocol/codex-acp@1.2.3' })));
    assert.isUndefined(npmScopeNameFor(install({ prefix: '/tmp/evil/runtime/1.2.3' })));
    assert.isUndefined(npmScopeNameFor(install({ prefix: `${PREFIX}/../../..` })));
    assert.isUndefined(npmScopeNameFor([...install(), '--registry=https://evil.example']));
  });
});
