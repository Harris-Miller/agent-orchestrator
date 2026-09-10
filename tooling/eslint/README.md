# @tooling/eslint

Shared ESLint config for the monorepo, built on `eslint-config-harris`.

## Exports

- `.` — base config
- `./react` — React-specific rules (for `apps/desktop`)
- `./globals` — shared global definitions

## Usage

```js
// eslint.config.js
import config from '@tooling/eslint';
export default config;
```
