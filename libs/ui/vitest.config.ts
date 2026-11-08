import { sharedConfig } from '@tooling/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

/** Beta launch targets enabled in unit tests (mirrors app .env.development). */
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      env: {
        AO_ANTIGRAVITY_BETA: 'true',
        AO_CURSOR_BETA: 'true',
      },
    },
  }),
);
