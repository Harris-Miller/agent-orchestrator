/** First-run provider defaults: which providers start enabled. Seeded once, never reapplied. */
import { readUserSettingsStrict, writeUserSettings } from '@lib/ao-home';
import type { UserSettings } from '@lib/ao-home';
import { Effect, Option } from 'effect';

import { findExecutableOnPath } from './findExecutableOnPath.ts';

/** Claude/Codex start on only when their CLIs are on PATH. Antigravity/Cursor start off. */
export const detectProviderEnabledDefaults = Effect.fn('detectProviderEnabledDefaults')(function* () {
  const claude = Option.isSome(yield* findExecutableOnPath('claude'));
  const codex = Option.isSome(yield* findExecutableOnPath('codex'));
  return {
    'antigravity-acp': false,
    'claude-agent-acp': claude,
    'codex-acp': codex,
    'cursor-acp': false,
  } satisfies Record<string, boolean>;
});

/**
 * Seed `providerEnabled` only when it is absent. Re-reads the latest settings strictly (malformed or unreadable
 * settings fail and are never overwritten) and patches them, preserving every unrelated key.
 * Returns the settings now on disk and whether seeding happened.
 */
export const seedProviderEnabledIfAbsent = Effect.fn('seedProviderEnabledIfAbsent')(function* () {
  const detected = yield* detectProviderEnabledDefaults();
  const latest = yield* readUserSettingsStrict();
  if (latest.providerEnabled !== undefined) {
    return { seeded: false, settings: latest } as const;
  }
  const next: UserSettings = { ...latest, providerEnabled: detected };
  yield* writeUserSettings(next);
  return { seeded: true, settings: next } as const;
});
