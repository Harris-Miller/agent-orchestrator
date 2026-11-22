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
      assert.strictEqual(decoded.providerEnabled?.['claude-agent-acp'], true);
      assert.strictEqual(decoded.showProvidersOnStartup, false);
      const encoded = yield* Schema.encodeEffect(UserSettingsJsonString)(decoded);
      assert.deepStrictEqual(JSON.parse(encoded), JSON.parse(input));
    }),
  );

  it.effect('round-trips workstreamsEnabled', () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeEffect(UserSettingsJsonString)(JSON.stringify({ workstreamsEnabled: true }));
      assert.strictEqual(decoded.workstreamsEnabled, true);
      const encoded = yield* Schema.encodeEffect(UserSettingsJsonString)(decoded);
      assert.deepStrictEqual(JSON.parse(encoded), { workstreamsEnabled: true });
    }),
  );

  it.effect('round-trips hiddenModels and modelOrder per launch target', () =>
    Effect.gen(function* () {
      const input = JSON.stringify({
        hiddenModels: { 'codex-acp': ['gpt-5-mini'] },
        modelOrder: { 'codex-acp': ['gpt-5', 'gpt-5-mini'] },
      });
      const decoded = yield* Schema.decodeEffect(UserSettingsJsonString)(input);
      assert.deepStrictEqual(decoded.hiddenModels?.['codex-acp'], ['gpt-5-mini']);
      const encoded = yield* Schema.encodeEffect(UserSettingsJsonString)(decoded);
      assert.deepStrictEqual(JSON.parse(encoded), JSON.parse(input));
    }),
  );
});
