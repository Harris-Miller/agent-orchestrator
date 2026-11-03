import { assert, describe, it } from '@effect/vitest';

import { classifyVendorAuthFailure, notAuthenticatedMessage } from './authMessages.ts';
import type { VendorAuthLaunchTarget } from './authMessages.ts';

const VENDOR_TARGETS: readonly VendorAuthLaunchTarget[] = ['claude-agent-acp', 'codex-acp', 'cursor-acp'];

describe('classifyVendorAuthFailure', () => {
  it('classifies known auth failures as NotSignedIn with the instruction text', () => {
    for (const launchTarget of VENDOR_TARGETS) {
      for (const message of ['Authentication required', 'not logged in', 'login required']) {
        assert.deepStrictEqual(classifyVendorAuthFailure(launchTarget, message), {
          _tag: 'NotSignedIn',
          message: notAuthenticatedMessage(launchTarget),
        });
      }
    }
  });

  it('keeps ordinary failures Failed even when they mention signing in', () => {
    for (const message of [
      '401 Unauthorized from proxy',
      'invalid api key',
      'Could not log in to the telemetry endpoint',
      'failed to sign in the commit',
    ]) {
      assert.deepStrictEqual(classifyVendorAuthFailure('codex-acp', message), { _tag: 'Failed', message });
    }
  });

  it('does not classify antigravity here', () => {
    assert.deepStrictEqual(classifyVendorAuthFailure('antigravity-acp', 'not signed in'), {
      _tag: 'Failed',
      message: 'not signed in',
    });
  });
});
