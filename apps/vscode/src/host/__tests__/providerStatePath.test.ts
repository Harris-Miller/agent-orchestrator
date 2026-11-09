import { assert, describe, it } from 'vitest';

import { isProviderCurrentJsonPath } from '../providerStatePath';

const HOME = '/home/operator';

describe('isProviderCurrentJsonPath', () => {
  it('accepts a provider current.json under ~/.hoa/providers', () => {
    assert.isTrue(isProviderCurrentJsonPath(HOME, `${HOME}/.hoa/providers/claude-agent-acp/current.json`));
  });

  it('rejects other files, traversal and nested paths', () => {
    for (const path of [
      `${HOME}/.hoa/settings.json`,
      `${HOME}/.hoa/providers/claude-agent-acp/runtime/1.0.0/current.json`,
      `${HOME}/.hoa/providers/../settings.json`,
      `${HOME}/.hoa/providers/claude-agent-acp/../x/current.json`,
      `${HOME}/.hoa/providers/Bad_Id/current.json`,
      `${HOME}/.hoa/providers/current.json`,
      `/etc/.hoa/providers/claude-agent-acp/current.json`,
    ]) {
      assert.isFalse(isProviderCurrentJsonPath(HOME, path), path);
    }
  });
});
