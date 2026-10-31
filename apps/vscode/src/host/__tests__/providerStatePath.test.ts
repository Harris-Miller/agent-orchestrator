import { assert, describe, it } from 'vitest';

import { isProviderCurrentJsonPath } from '../providerStatePath';

const HOME = '/home/operator';

describe('isProviderCurrentJsonPath', () => {
  it('accepts a provider current.json under ~/.ao/providers', () => {
    assert.isTrue(isProviderCurrentJsonPath(HOME, `${HOME}/.ao/providers/claude-agent-acp/current.json`));
  });

  it('rejects other files, traversal and nested paths', () => {
    for (const path of [
      `${HOME}/.ao/settings.json`,
      `${HOME}/.ao/providers/claude-agent-acp/runtime/1.0.0/current.json`,
      `${HOME}/.ao/providers/../settings.json`,
      `${HOME}/.ao/providers/claude-agent-acp/../x/current.json`,
      `${HOME}/.ao/providers/Bad_Id/current.json`,
      `${HOME}/.ao/providers/current.json`,
      `/etc/.ao/providers/claude-agent-acp/current.json`,
    ]) {
      assert.isFalse(isProviderCurrentJsonPath(HOME, path), path);
    }
  });
});
