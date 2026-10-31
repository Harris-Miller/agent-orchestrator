import { assert, describe, it } from '@effect/vitest';

import { normalizeVendorAuthMessage } from './authMessages.ts';

describe('normalizeVendorAuthMessage', () => {
  it('rewrites sign-in failures and leaves ordinary errors alone', () => {
    assert.strictEqual(
      normalizeVendorAuthMessage('claude-agent-acp', 'Authentication required'),
      '`claude` is not authenticated — run `claude` and log in',
    );
    assert.strictEqual(
      normalizeVendorAuthMessage('claude-agent-acp', '401 Unauthorized from proxy'),
      '401 Unauthorized from proxy',
    );
    assert.strictEqual(normalizeVendorAuthMessage('codex-acp', 'invalid api key'), 'invalid api key');
    assert.strictEqual(normalizeVendorAuthMessage('antigravity-acp', 'not signed in'), 'not signed in');
  });
});
