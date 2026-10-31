import { assert, describe, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';

import { UserSettingsJsonString } from './UserSettings.ts';

describe('UserSettings provider fields', () => {
  it.effect('round-trips providerEnabled and showProvidersOnStartup, preserving unrelated keys', () =>
    Effect.gen(function* () {
      const input = JSON.stringify({
        providerEnabled: { 'claude-agent-acp': true, 'codex-acp': false },
        showProvidersOnStartup: false,
        extra: 1,
      });
      const decoded = yield* Schema.decodeEffect(UserSettingsJsonString)(input);
      assert.strictEqual(decoded.providerEnabled?.['claude-agent-acp' as never], true);
      assert.strictEqual(decoded.showProvidersOnStartup, false);
      const encoded = yield* Schema.encodeEffect(UserSettingsJsonString)(decoded);
      assert.deepStrictEqual(JSON.parse(encoded), JSON.parse(input));
    }),
  );
});
