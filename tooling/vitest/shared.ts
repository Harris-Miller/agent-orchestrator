import { defineConfig, mergeConfig } from 'vitest/config';

/** Shared Vitest defaults for workspace packages (local `test`). */
export const sharedConfig = defineConfig({
  test: {
    coverage: {
      enabled: false,
      exclude: ['src/**/__tests__/**', 'src/**/*.test.ts', 'src/**/*.d.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8' as const,
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
    include: ['src/**/*.test.ts'],
    outputFile: {
      blob: 'coverage/blob/report.json',
    },
    passWithNoTests: true,
    silent: 'passed-only' as const,
  },
});

/**
 * CI coverage settings: enable coverage + blob reporter for mergeable monorepo reports.
 * Spread into a package vitest config used by `test:ci`, or pass via CLI flags.
 */
export const ciCoverageConfig = mergeConfig(sharedConfig, {
  test: {
    coverage: {
      enabled: true,
    },
    outputFile: {
      blob: 'coverage/blob/report.json',
    },
    reporters: ['default', 'blob', 'github-actions'],
  },
});
