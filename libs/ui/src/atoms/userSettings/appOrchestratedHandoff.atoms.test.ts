import { assert, describe, it } from '@effect/vitest';

import { appOrchestratedHandoffEnabled } from './userSettingsDocument.atoms.ts';

describe('appOrchestratedHandoffEnabled', () => {
  it('defaults to false when unset', () => {
    assert.isFalse(appOrchestratedHandoffEnabled({}));
  });

  it('is true when explicitly true', () => {
    assert.isTrue(appOrchestratedHandoffEnabled({ appOrchestratedHandoffEnabled: true }));
  });

  it('is false when explicitly false', () => {
    assert.isFalse(appOrchestratedHandoffEnabled({ appOrchestratedHandoffEnabled: false }));
  });
});
