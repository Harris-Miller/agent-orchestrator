# @tooling/vitest

Shared Vitest defaults for workspace packages: coverage settings, test file globs, and reporters.

## Exports

- `sharedConfig` — local `test` defaults (coverage disabled, `passWithNoTests`)
- `ciCoverageConfig` — CI variant with coverage + blob reporter enabled, for mergeable monorepo coverage reports

## Usage

```ts
// vitest.config.ts
import { sharedConfig } from '@tooling/vitest';
export default sharedConfig;
```
