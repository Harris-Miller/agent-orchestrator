import { assert, describe, it } from '@effect/vitest';

import { appOrchestratedAgentsEnabled } from './userSettingsDocument.atoms.ts';

describe('appOrchestratedAgentsEnabled', () => {
  it('defaults to false when unset', () => {
    assert.isFalse(appOrchestratedAgentsEnabled({}));
  });

  it('is true when explicitly true', () => {
    assert.isTrue(appOrchestratedAgentsEnabled({ appOrchestratedAgentsEnabled: true }));
  });

  it('is false when explicitly false', () => {
    assert.isFalse(appOrchestratedAgentsEnabled({ appOrchestratedAgentsEnabled: false }));
  });
});
