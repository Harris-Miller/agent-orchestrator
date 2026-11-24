/**
 * semantic-release config. Release CI only computes the next version and notes from it (`scripts/release-version.mjs`,
 * dry run); CI creates the tag and the GitHub Release itself. See `apps/desktop/docs/alpha-release.md`.
 */
export default {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'eslint',
        // Alpha: every releasable tag is a patch. Beta: `New` and `Breaking` → minor. 1.x: `New` → minor, `Breaking` → major.
        // Other tags (`Docs`, `Build`, `Upgrade`, `Chore`) don't trigger a release.
        releaseRules: [
          { tag: 'Breaking', release: 'patch' },
          { tag: 'Fix', release: 'patch' },
          { tag: 'Update', release: 'patch' },
          { tag: 'New', release: 'patch' },
        ],
      },
    ],
    ['@semantic-release/release-notes-generator', { preset: 'eslint' }],
  ],
};
