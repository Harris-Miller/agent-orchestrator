import { assert, describe, it } from '@effect/vitest';
import { Schema } from 'effect';

import { LaunchTargetSchema } from './index.ts';

describe('LaunchTargetSchema', () => {
  it('accepts kebab-case launch targets', () => {
    assert.strictEqual(Schema.decodeSync(LaunchTargetSchema)('antigravity-acp'), 'antigravity-acp');
  });

  it('rejects non-kebab launch targets', () => {
    for (const bad of ['../x', 'a/b', '', 'GeminiAcp', 'gemini_acp']) {
      assert.throws(() => Schema.decodeSync(LaunchTargetSchema)(bad));
    }
  });
});
