import { assert, describe, it } from 'vitest';

import { resolve, sep } from 'node:path';

import { isProviderCurrentJsonPath } from '../providerStatePath';

const HOME = resolve('/home/operator');
const fixturePath = (...segments: string[]) => [HOME, ...segments].join(sep);

describe('isProviderCurrentJsonPath', () => {
  it('accepts a provider current.json under ~/.hoa/providers', () => {
    assert.isTrue(
      isProviderCurrentJsonPath(HOME, fixturePath('.hoa', 'providers', 'claude-agent-acp', 'current.json')),
    );
  });

  it('rejects other files, traversal and nested paths', () => {
    for (const path of [
      fixturePath('.hoa', 'settings.json'),
      fixturePath('.hoa', 'providers', 'claude-agent-acp', 'runtime', '1.0.0', 'current.json'),
      fixturePath('.hoa', 'providers', '..', 'settings.json'),
      fixturePath('.hoa', 'providers', 'claude-agent-acp', '..', 'x', 'current.json'),
      fixturePath('.hoa', 'providers', 'Bad_Id', 'current.json'),
      fixturePath('.hoa', 'providers', 'current.json'),
      resolve('/etc/.hoa/providers/claude-agent-acp/current.json'),
    ]) {
      assert.isFalse(isProviderCurrentJsonPath(HOME, path), path);
    }
  });
});
